import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  CONTACT_PER_IP_PER_HOUR,
  MIN_CONTACT_SUBMIT_MS,
  SES_GLOBAL_DAILY_CAP,
} from '@gagnechris/shared';
import { useApi } from './support/harness.js';

type Mail = {
  from: string;
  to: string[];
  replyTo: string[];
  subject: string;
  text: string;
};

const dir = mkdtempSync(join(tmpdir(), 'contact-outbox-'));
const outbox = join(dir, 'outbox.jsonl');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function sentMail(): Mail[] {
  try {
    return readFileSync(outbox, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Mail);
  } catch {
    return [];
  }
}

const h = useApi('contact', {
  env: {
    LOCAL_OUTBOX_FILE: outbox,
    CONTACT_FROM_EMAIL: 'noreply@test.gagnechris.com',
    CONTACT_TO_EMAIL: 'owner@test.gagnechris.com',
    SITE_APEX_DOMAIN: 'test.gagnechris.com',
  },
});

beforeEach(() => writeFileSync(outbox, ''));

const valid = {
  name: 'Ada',
  email: 'ada@example.com',
  message: 'Hello there',
  elapsedMs: MIN_CONTACT_SUBMIT_MS + 1_000,
};

async function rows(prefix: string) {
  const out = await h.doc.send(new ScanCommand({ TableName: h.tableName }));
  return (out.Items ?? []).filter((item) => String(item.pk).startsWith(prefix));
}

function utcDay(at = new Date()): string {
  return at.toISOString().slice(0, 10);
}

describe('POST /api/contact', () => {
  it('stores the message, mails the owner and marks it sent', async () => {
    const res = await h.api.request('POST', '/api/contact', {
      body: { ...valid, name: '  Ada  ', email: ' ada@example.com ' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers.get('cache-control')).toBeNull();

    const [row] = await rows('CONTACT#');
    expect(row).toMatchObject({
      sk: 'MSG',
      entityType: 'contact',
      name: 'Ada',
      email: 'ada@example.com',
      message: 'Hello there',
      sourceIp: '127.0.0.1',
      emailStatus: 'sent',
    });
    expect(row!.pk).toBe(`CONTACT#${row!.contactId}`);
    expect(row!.contactId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row!.createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(row).not.toHaveProperty('emailError');

    expect(sentMail()).toEqual([
      {
        from: 'noreply@test.gagnechris.com',
        to: ['owner@test.gagnechris.com'],
        replyTo: ['ada@example.com'],
        subject: '[test.gagnechris.com] Contact from Ada',
        text: `Name: Ada\nEmail: ada@example.com\nContactId: ${row!.contactId}\n\nHello there`,
      },
    ]);
  });

  it.each([
    [
      'missing fields',
      {},
      {
        name: 'invalid_type',
        email: 'invalid_type',
        message: 'invalid_type',
      },
    ],
    [
      'blank and malformed fields',
      { name: '  ', email: 'nope', message: '\n' },
      { name: 'too_small', email: 'invalid_format', message: 'too_small' },
    ],
    [
      'too long fields',
      {
        ...valid,
        name: 'n'.repeat(201),
        email: `${'e'.repeat(320)}@example.com`,
        message: 'm'.repeat(10_001),
        hp_field: 'h'.repeat(201),
      },
      {
        name: 'too_big',
        email: 'too_big',
        message: 'too_big',
        hp_field: 'too_big',
      },
    ],
    [
      'wrong types',
      { ...valid, name: 5, website: null, elapsedMs: '3000' },
      {
        name: 'invalid_type',
        website: 'invalid_type',
        elapsedMs: 'invalid_type',
      },
    ],
    [
      'bad timings',
      { ...valid, elapsedMs: 2.5, formStartedAt: -1 },
      { elapsedMs: 'invalid_type', formStartedAt: 'too_small' },
    ],
    ['an array body', [], { _root: 'invalid_type' }],
  ])('rejects %s with field codes', async (_, body, fields) => {
    const res = await h.api.request('POST', '/api/contact', { body });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields,
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await rows('CONTACT#')).toEqual([]);
  });

  it('counts length in code points, as the form does', async () => {
    const res = await h.api.request('POST', '/api/contact', {
      body: { ...valid, name: '😀'.repeat(200) },
    });
    expect(res.status).toBe(200);
  });

  it('rejects a body that is not JSON', async () => {
    const res = await h.api.request('POST', '/api/contact', {
      body: '{"name":',
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid JSON body',
    });
  });

  it.each([
    ['hp_field', () => ({ hp_field: 'bot' })],
    ['website', () => ({ website: 'https://spam.example' })],
    ['a too-fast submit', () => ({ elapsedMs: MIN_CONTACT_SUBMIT_MS - 1 })],
    [
      'a too-fast submit by start time',
      () => ({ elapsedMs: undefined, formStartedAt: Date.now() - 100 }),
    ],
  ])('answers ok to %s but stores and sends nothing', async (_, extra) => {
    const res = await h.api.request('POST', '/api/contact', {
      body: { ...valid, ...extra() },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await rows('CONTACT#')).toEqual([]);
    expect(await rows('RATE#')).toEqual([]);
    expect(sentMail()).toEqual([]);
  });

  it('prefers elapsedMs over a skewed start time', async () => {
    const res = await h.api.request('POST', '/api/contact', {
      body: { ...valid, formStartedAt: Date.now() - 50 },
    });
    expect(res.status).toBe(200);
    expect(sentMail()).toHaveLength(1);
  });

  it('limits each address per hour', async () => {
    for (let i = 0; i < CONTACT_PER_IP_PER_HOUR; i += 1) {
      const res = await h.api.request('POST', '/api/contact', { body: valid });
      expect(res.status).toBe(200);
    }
    const limited = await h.api.request('POST', '/api/contact', {
      body: valid,
    });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: 'rate_limited',
      message:
        'Too many contact submissions from this address. Try again later.',
    });
    expect(await rows('CONTACT#')).toHaveLength(CONTACT_PER_IP_PER_HOUR);
    expect(sentMail()).toHaveLength(CONTACT_PER_IP_PER_HOUR);

    const [counter] = await rows('RATE#contact#ip#127.0.0.1');
    expect(counter).toMatchObject({
      count: CONTACT_PER_IP_PER_HOUR,
      entityType: 'rateLimit',
    });
    expect(counter!.sk).toBe(`HOUR#${new Date().toISOString().slice(0, 13)}`);
    expect(counter!.ttl).toBeGreaterThan(Date.now() / 1000 + 3600);
  });

  it('saves but does not mail once the daily mail cap is reached', async () => {
    await h.doc.send(
      new PutCommand({
        TableName: h.tableName,
        Item: {
          pk: 'RATE#ses#global',
          sk: `DAY#${utcDay()}`,
          count: SES_GLOBAL_DAILY_CAP,
          entityType: 'rateLimit',
        },
      }),
    );
    const res = await h.api.request('POST', '/api/contact', { body: valid });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: 'rate_limited',
      message:
        'Daily email quota reached. Your message was saved; try again tomorrow.',
    });
    const [row] = await rows('CONTACT#');
    expect(row).toMatchObject({
      emailStatus: 'failed',
      emailError:
        'Daily email quota reached. Your message was saved; try again tomorrow.',
    });
    expect(sentMail()).toEqual([]);
  });
});

describe('POST /api/resume/download', () => {
  it('mails the owner once per address per day', async () => {
    const first = await h.api.request('POST', '/api/resume/download', {
      body: { referrer: 'https://example.com/jobs' },
      headers: { 'user-agent': 'TestBrowser/1.0' },
    });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ok: true });
    const again = await h.api.request('POST', '/api/resume/download', {
      body: {},
    });
    expect(again.status).toBe(200);

    const mail = sentMail();
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toBe('[test.gagnechris.com] Resume downloaded');
    expect(mail[0]!.replyTo).toEqual([]);
    expect(mail[0]!.text).toMatch(
      /^A visitor downloaded the resume PDF\.\nTime: \d{4}-\d\d-\d\dT[\d:.]+Z\nReferrer: https:\/\/example\.com\/jobs\nUser-Agent: TestBrowser\/1\.0$/,
    );

    const claim = await h.doc.send(
      new GetCommand({
        TableName: h.tableName,
        Key: { pk: 'RATE#resume#ip#127.0.0.1', sk: `DAY#${utcDay()}` },
      }),
    );
    expect(claim.Item).toMatchObject({ count: 1, entityType: 'rateLimit' });
  });

  it('stays quiet once the daily mail cap is reached', async () => {
    await h.doc.send(
      new PutCommand({
        TableName: h.tableName,
        Item: {
          pk: 'RATE#ses#global',
          sk: `DAY#${utcDay()}`,
          count: SES_GLOBAL_DAILY_CAP,
          entityType: 'rateLimit',
        },
      }),
    );
    const res = await h.api.request('POST', '/api/resume/download', {
      body: {},
    });
    expect(res.status).toBe(200);
    expect(sentMail()).toEqual([]);
  });

  it('rejects a bad referrer', async () => {
    const res = await h.api.request('POST', '/api/resume/download', {
      body: { referrer: 'r'.repeat(501) },
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields: { referrer: 'too_big' },
    });
  });
});

describe('when mail delivery fails', () => {
  // A directory can't be appended to, so every send fails.
  const failing = useApi('contact-mail-fails', {
    env: { LOCAL_OUTBOX_FILE: tmpdir() },
  });

  it('keeps the message, marks it failed and answers 502', async () => {
    const res = await failing.api.request('POST', '/api/contact', {
      body: valid,
    });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'email_failed',
      message:
        'Your message was saved but email delivery failed. Please try again later.',
    });
    const out = await failing.doc.send(
      new ScanCommand({ TableName: failing.tableName }),
    );
    const row = (out.Items ?? []).find((item) =>
      String(item.pk).startsWith('CONTACT#'),
    );
    expect(row).toMatchObject({ emailStatus: 'failed' });
    expect(String(row!.emailError)).not.toBe('');
  });

  it('still answers ok to a resume download', async () => {
    const res = await failing.api.request('POST', '/api/resume/download', {
      body: {},
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
