import { describe, expect, it } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import {
  DAILY_TEMPLATE_MAX_BYTES,
  DEFAULT_DAILY_TEMPLATES,
} from '@gagnechris/shared';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const USER = 'user-templates-http';
const OTHER = 'user-templates-http-other';
const WORK = '/api/notebook/templates/daily/work';
const PERSONAL = '/api/notebook/templates/daily/personal';
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

const h = useApi('templates-http');
const { call } = apiCalls(h, { user: USER });

describe('daily templates over HTTP (DynamoDB Local)', () => {
  it('serves the built-in template until one is saved, storing nothing', async () => {
    const res = await call('GET', WORK);
    expect(res.status).toBe(200);
    expect(res.etag).toBe('"0"');
    expect(res.body).toEqual({
      area: 'work',
      bodyMarkdown: DEFAULT_DAILY_TEMPLATES.work,
      carryOverSection: null,
      isDefault: true,
      version: 0,
      updatedAt: null,
    });
    const stored = await h.doc.send(
      new GetCommand({
        TableName: h.tableName,
        Key: keys.notebook.dailyTemplate(USER, 'work'),
      }),
    );
    expect(stored.Item).toBeUndefined();
  });

  it('saves with If-Match, rejects a stale version, and resets to the default', async () => {
    const saved = await call('PUT', WORK, {
      body: { bodyMarkdown: '## Focus\n- [ ] inbox zero\n' },
      ifMatch: '"0"',
    });
    expect(saved.status).toBe(200);
    expect(saved.etag).toBe('"1"');
    expect(saved.body).toEqual({
      area: 'work',
      bodyMarkdown: '## Focus\n- [ ] inbox zero\n',
      carryOverSection: null,
      isDefault: false,
      version: 1,
      updatedAt: ISO,
    });
    expect(await call('GET', WORK)).toMatchObject({
      status: 200,
      etag: '"1"',
      body: saved.body,
    });

    const stale = await call('PUT', WORK, {
      body: { bodyMarkdown: 'other device' },
      ifMatch: '"0"',
    });
    expect(stale.status).toBe(412);
    expect(stale.body).toEqual({
      error: 'precondition_failed',
      message: 'Version conflict: expected 0, current 1',
      currentVersion: 1,
      current: saved.body,
    });

    const staleBody = await call('PUT', WORK, {
      body: { version: 0, bodyMarkdown: 'x' },
    });
    expect(staleBody.status).toBe(409);
    expect(staleBody.body).toEqual({
      error: 'version_conflict',
      message: 'Version conflict: expected 0, current 1',
      currentVersion: 1,
      current: saved.body,
    });

    const noVersion = await call('PUT', WORK, {
      body: { bodyMarkdown: 'no version' },
    });
    expect(noVersion.status).toBe(400);
    expect(noVersion.body).toEqual({
      error: 'bad_request',
      message: 'Expected version required (If-Match or body.version)',
    });

    const staleReset = await call('DELETE', WORK, { body: { version: 0 } });
    expect(staleReset.status).toBe(409);
    expect(staleReset.body).toEqual({
      error: 'version_conflict',
      message: 'Version conflict: expected 0, current 1',
      currentVersion: 1,
      current: saved.body,
    });

    const unchanged = await call('DELETE', PERSONAL, { body: { version: 0 } });
    expect(unchanged.status).toBe(200);
    expect(unchanged.body).toEqual({
      area: 'personal',
      bodyMarkdown: DEFAULT_DAILY_TEMPLATES.personal,
      carryOverSection: null,
      isDefault: true,
      version: 0,
      updatedAt: null,
    });

    const reset = await call('DELETE', WORK, { ifMatch: '"1"' });
    expect(reset.status).toBe(200);
    expect(reset.etag).toBe('"2"');
    expect(reset.body).toEqual({
      area: 'work',
      bodyMarkdown: DEFAULT_DAILY_TEMPLATES.work,
      carryOverSection: null,
      isDefault: true,
      version: 2,
      updatedAt: ISO,
    });
    const stored = await h.doc.send(
      new GetCommand({
        TableName: h.tableName,
        Key: keys.notebook.dailyTemplate(USER, 'work'),
      }),
    );
    expect(stored.Item).toMatchObject({ bodyMarkdown: '', version: 2 });

    const staleAfterReset = await call('PUT', WORK, {
      body: { version: 1, bodyMarkdown: 'Stale' },
    });
    expect(staleAfterReset.status).toBe(409);
    const again = await call('PUT', WORK, {
      body: { version: 2, bodyMarkdown: 'New' },
    });
    expect(again.status).toBe(200);
    expect(again.etag).toBe('"3"');
    expect(again.body).toMatchObject({
      version: 3,
      bodyMarkdown: 'New',
      isDefault: false,
    });
  });

  it('keeps the carry-over section a heading of the template, kept when a save leaves it out', async () => {
    const stored = async () =>
      (
        await h.doc.send(
          new GetCommand({
            TableName: h.tableName,
            Key: keys.notebook.dailyTemplate(USER, 'work'),
          }),
        )
      ).Item;
    const body = '## Focus for {{weekday}}\n\n## Meetings\n';

    const missing = await call('PUT', WORK, {
      body: { version: 0, bodyMarkdown: body, carryOverSection: 'Standup' },
    });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields: { carryOverSection: 'custom' },
    });
    expect(await stored()).toBeUndefined();

    const saved = await call('PUT', WORK, {
      body: { version: 0, bodyMarkdown: body, carryOverSection: 'Meetings' },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ carryOverSection: 'Meetings' });
    expect(await stored()).toMatchObject({ carryOverSection: 'Meetings' });

    // The iOS editor saves the text alone.
    const textOnly = await call('PUT', WORK, {
      body: { version: 1, bodyMarkdown: `${body}\n## Notes\n` },
    });
    expect(textOnly.status).toBe(200);
    expect(textOnly.body).toMatchObject({
      version: 2,
      carryOverSection: 'Meetings',
    });
    expect((await call('GET', WORK)).body).toMatchObject({
      carryOverSection: 'Meetings',
    });

    const cleared = await call('PUT', WORK, {
      body: { version: 2, bodyMarkdown: body, carryOverSection: null },
    });
    expect(cleared.body).toMatchObject({ version: 3, carryOverSection: null });
    expect(await stored()).not.toHaveProperty('carryOverSection');

    await call('PUT', WORK, {
      body: { version: 3, bodyMarkdown: body, carryOverSection: 'Meetings' },
    });
    const reset = await call('DELETE', WORK, { body: { version: 4 } });
    expect(reset.body).toMatchObject({
      isDefault: true,
      carryOverSection: null,
    });
    expect(await stored()).not.toHaveProperty('carryOverSection');
  });

  it('rejects task lines and embeds but allows checklists and code', async () => {
    const put = (bodyMarkdown: string) =>
      call('PUT', WORK, { body: { version: 0, bodyMarkdown } });

    const task = await put('## Plans\n[ ] call the bank\n');
    expect(task.status).toBe(400);
    expect(task.body).toEqual({
      error: 'bad_request',
      message: 'Invalid request body',
      fields: { bodyMarkdown: 'custom' },
    });

    const embed = await put('{{task:01ARZ3NDEKTSV4RRFFQ48JMCZC}}\n');
    expect(embed.status).toBe(400);
    expect(embed.body).toEqual(task.body);

    const ok = await put('```\n[ ] not a task\n```\n- [ ] ok\n');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      bodyMarkdown: '```\n[ ] not a task\n```\n- [ ] ok\n',
      version: 1,
    });
  });

  it('answers 413 payload_too_large over the size limit and stores nothing', async () => {
    const res = await call('PUT', WORK, {
      body: {
        version: 0,
        bodyMarkdown: 'a'.repeat(DAILY_TEMPLATE_MAX_BYTES + 1),
      },
    });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: 'payload_too_large',
      message: `Template is over the ${DAILY_TEMPLATE_MAX_BYTES / 1000} KB limit`,
      fields: { bodyMarkdown: 'too_big' },
    });
    expect((await call('GET', WORK)).body).toMatchObject({
      isDefault: true,
      version: 0,
    });

    const atLimit = await call('PUT', WORK, {
      body: { version: 0, bodyMarkdown: 'a'.repeat(DAILY_TEMPLATE_MAX_BYTES) },
    });
    expect(atLimit.status).toBe(200);
  });

  it("starts an empty day from the user's own template, filled for that day", async () => {
    const saved = await call('PUT', WORK, {
      body: {
        version: 0,
        bodyMarkdown: '# {{date}}\n{{area}} {{weekday}} {{unknown}}\n',
      },
    });
    expect(saved.status).toBe(200);

    const day = await call('GET', '/api/notebook/notes/daily/work/2026-10-16');
    expect(day.status).toBe(200);
    expect(day.body).toMatchObject({
      exists: false,
      area: 'work',
      date: '2026-10-16',
      version: 0,
      bodyMarkdown: '',
      templateMarkdown: '# Friday, October 16\nWork Friday {{unknown}}\n',
    });

    const personal = await call(
      'GET',
      '/api/notebook/notes/daily/personal/2026-10-16',
    );
    expect(personal.body.templateMarkdown).toBe(
      DEFAULT_DAILY_TEMPLATES.personal,
    );

    const other = await call(
      'GET',
      '/api/notebook/notes/daily/work/2026-10-16',
      { user: OTHER },
    );
    expect(other.body.templateMarkdown).toBe(
      '## Focus for Friday\n- \n\n## Standup\n\n## Meetings\n\n## Notes\n\n## Tomorrow\n- \n',
    );
    expect((await call('GET', WORK, { user: OTHER })).body).toMatchObject({
      isDefault: true,
      version: 0,
    });
  });

  it('never changes a note that already exists', async () => {
    const created = await call(
      'PUT',
      '/api/notebook/notes/daily/work/2026-10-16',
      { body: { id: '01ARZ3NDEKTSV4RRFFQ48JMCZC', bodyMarkdown: 'Started' } },
    );
    expect(created.status).toBe(200);
    await call('PUT', WORK, { body: { version: 0, bodyMarkdown: 'Changed' } });
    const day = await call('GET', '/api/notebook/notes/daily/work/2026-10-16');
    expect(day.body).toMatchObject({
      id: '01ARZ3NDEKTSV4RRFFQ48JMCZC',
      bodyMarkdown: 'Started',
      version: 1,
    });
    expect(day.body.templateMarkdown).toBeUndefined();
  });

  it('rejects an unknown area and a malformed If-Match', async () => {
    const area = await call('GET', '/api/notebook/templates/daily/garden');
    expect(area.status).toBe(400);
    expect(area.body).toEqual({
      error: 'bad_request',
      message: 'Invalid path parameters',
      fields: { area: 'invalid_value' },
    });

    const header = await call('PUT', WORK, {
      body: { bodyMarkdown: 'x' },
      ifMatch: 'abc',
    });
    expect(header.status).toBe(400);
    expect(header.body).toEqual({
      error: 'bad_request',
      message: 'Invalid If-Match header',
    });
  });
});
