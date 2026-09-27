import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  handleContactRoute,
  MIN_CONTACT_SUBMIT_MS,
} from '../src/contact/handlers.js';
import { setSesClient } from '../src/contact/mail.js';
import { ContactRepository } from '../src/contact/repository.js';
import { RateLimiter } from '../src/contact/rateLimit.js';

function eventWithBody(
  body: unknown,
  ip = '127.0.0.1',
): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    isBase64Encoded: false,
    headers: { 'user-agent': 'vitest' },
    requestContext: { http: { sourceIp: ip } },
  } as unknown as APIGatewayProxyEventV2;
}

function mockDoc(
  impl: (command: {
    constructor: { name: string };
    input: Record<string, unknown>;
  }) => Promise<unknown>,
): DynamoDBDocumentClient {
  return {
    send: vi.fn(async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => impl(command)),
  } as unknown as DynamoDBDocumentClient;
}

describe('contact routes', () => {
  afterEach(() => {
    setSesClient(undefined);
    delete process.env.CONTACT_TO_EMAIL;
    delete process.env.CONTACT_FROM_EMAIL;
    delete process.env.SITE_APEX_DOMAIN;
    delete process.env.DATA_TABLE_NAME;
  });

  it('rejects invalid contact bodies with friendly field codes', async () => {
    const res = await handleContactRoute(
      eventWithBody({ name: '', email: 'nope', message: '' }),
      'POST',
      '/api/contact',
    );
    expect(res?.statusCode).toBe(400);
    const body = JSON.parse(res?.body ?? '{}') as {
      error: string;
      message: string;
      fields: Record<string, string>;
    };
    expect(body.error).toBe('bad_request');
    expect(body.message).toBe('Invalid request body');
    expect(body.message).not.toMatch(/\[\{/);
    expect(body.fields).toMatchObject({
      name: expect.any(String),
      email: expect.any(String),
      message: expect.any(String),
    });
  });

  it('silently accepts honeypot fills without sending or persisting', async () => {
    const send = vi.fn();
    setSesClient({ send } as never);
    process.env.CONTACT_TO_EMAIL = 'you@example.com';
    process.env.CONTACT_FROM_EMAIL = 'noreply@gagnechris.com';
    process.env.DATA_TABLE_NAME = 'gagnechris-test';
    const docSend = vi.fn();
    const doc = { send: docSend } as unknown as DynamoDBDocumentClient;
    const res = await handleContactRoute(
      eventWithBody({
        name: 'Bot',
        email: 'bot@example.com',
        message: 'spam',
        hp_field: 'http://spam.example',
      }),
      'POST',
      '/api/contact',
      {
        contacts: new ContactRepository(doc, 'gagnechris-test'),
        rates: new RateLimiter(doc, 'gagnechris-test'),
      },
    );
    expect(res?.statusCode).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(docSend).not.toHaveBeenCalled();
  });

  it('silently accepts legacy website honeypot fills', async () => {
    const send = vi.fn();
    setSesClient({ send } as never);
    const docSend = vi.fn();
    const doc = { send: docSend } as unknown as DynamoDBDocumentClient;
    const res = await handleContactRoute(
      eventWithBody({
        name: 'Bot',
        email: 'bot@example.com',
        message: 'spam',
        website: 'http://spam.example',
      }),
      'POST',
      '/api/contact',
      {
        contacts: new ContactRepository(doc, 't'),
        rates: new RateLimiter(doc, 't'),
      },
    );
    expect(res?.statusCode).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(docSend).not.toHaveBeenCalled();
  });

  it('silently accepts too-fast submits without sending', async () => {
    const send = vi.fn();
    setSesClient({ send } as never);
    const docSend = vi.fn();
    const doc = { send: docSend } as unknown as DynamoDBDocumentClient;
    const res = await handleContactRoute(
      eventWithBody({
        name: 'Speedy',
        email: 'fast@example.com',
        message: 'hi',
        hp_field: '',
        formStartedAt: Date.now() - 100,
      }),
      'POST',
      '/api/contact',
      {
        contacts: new ContactRepository(doc, 't'),
        rates: new RateLimiter(doc, 't'),
      },
    );
    expect(res?.statusCode).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(docSend).not.toHaveBeenCalled();
    expect(MIN_CONTACT_SUBMIT_MS).toBeGreaterThan(100);
  });

  it('persists then sends contact mail for valid submissions', async () => {
    const send = vi.fn(async () => ({}));
    setSesClient({ send } as never);
    process.env.CONTACT_TO_EMAIL = 'you@example.com';
    process.env.CONTACT_FROM_EMAIL = 'noreply@gagnechris.com';
    process.env.SITE_APEX_DOMAIN = 'gagnechris.com';

    const doc = mockDoc(async (command) => {
      if (command.constructor.name === 'PutCommand') {
        return {};
      }
      if (command.constructor.name === 'UpdateCommand') {
        return {};
      }
      return {};
    });

    const res = await handleContactRoute(
      eventWithBody({
        name: 'Chris',
        email: 'visitor@example.com',
        message: 'Hello',
        hp_field: '',
        formStartedAt: Date.now() - MIN_CONTACT_SUBMIT_MS - 50,
      }),
      'POST',
      '/api/contact',
      {
        contacts: new ContactRepository(doc, 'gagnechris-test'),
        rates: new RateLimiter(doc, 'gagnechris-test'),
      },
    );
    expect(res?.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const names = (doc.send as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[0] as { constructor: { name: string } }).constructor.name,
    );
    expect(names[0]).toBe('UpdateCommand'); // contact IP rate
    expect(names[1]).toBe('PutCommand'); // persist
    expect(names).toContain('UpdateCommand');
  });

  it('returns 502 when SES fails after persist (does not fake success)', async () => {
    const send = vi.fn(async () => {
      throw new Error('SES down');
    });
    setSesClient({ send } as never);
    process.env.CONTACT_TO_EMAIL = 'you@example.com';
    process.env.CONTACT_FROM_EMAIL = 'noreply@gagnechris.com';

    const doc = mockDoc(async () => ({}));
    const res = await handleContactRoute(
      eventWithBody({
        name: 'Chris',
        email: 'visitor@example.com',
        message: 'Hello',
        hp_field: '',
        formStartedAt: Date.now() - 10_000,
      }),
      'POST',
      '/api/contact',
      {
        contacts: new ContactRepository(doc, 't'),
        rates: new RateLimiter(doc, 't'),
      },
    );
    expect(res?.statusCode).toBe(502);
    expect(JSON.parse(res!.body!).error).toBe('email_failed');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns 429 when contact IP hourly limit is exceeded', async () => {
    const send = vi.fn(async () => ({}));
    setSesClient({ send } as never);
    process.env.CONTACT_TO_EMAIL = 'you@example.com';
    process.env.CONTACT_FROM_EMAIL = 'noreply@gagnechris.com';
    let contactIpCalls = 0;
    const doc = mockDoc(async (command) => {
      const key = command.input.Key as { pk?: string } | undefined;
      if (key?.pk?.startsWith('RATE#contact#ip#')) {
        contactIpCalls += 1;
        if (contactIpCalls > 3) {
          throw new ConditionalCheckFailedException({
            message: 'conditional',
            $metadata: {},
          });
        }
      }
      return {};
    });
    const deps = {
      contacts: new ContactRepository(doc, 't'),
      rates: new RateLimiter(doc, 't'),
    };
    const body = {
      name: 'Chris',
      email: 'visitor@example.com',
      message: 'Hello',
      hp_field: '',
      formStartedAt: Date.now() - 10_000,
    };
    for (let i = 0; i < 3; i += 1) {
      const ok = await handleContactRoute(
        eventWithBody(body),
        'POST',
        '/api/contact',
        deps,
      );
      expect(ok?.statusCode).toBe(200);
    }
    const limited = await handleContactRoute(
      eventWithBody(body),
      'POST',
      '/api/contact',
      deps,
    );
    expect(limited?.statusCode).toBe(429);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('notifies on first resume download per IP per day only', async () => {
    const send = vi.fn(async () => ({}));
    setSesClient({ send } as never);
    process.env.CONTACT_TO_EMAIL = 'you@example.com';
    process.env.CONTACT_FROM_EMAIL = 'noreply@gagnechris.com';

    let resumeClaims = 0;
    const doc = mockDoc(async (command) => {
      const key = command.input.Key as { pk?: string } | undefined;
      if (key?.pk?.startsWith('RATE#resume#ip#')) {
        resumeClaims += 1;
        if (resumeClaims > 1) {
          throw new ConditionalCheckFailedException({
            message: 'conditional',
            $metadata: {},
          });
        }
      }
      return {};
    });
    const deps = {
      contacts: new ContactRepository(doc, 't'),
      rates: new RateLimiter(doc, 't'),
    };

    const first = await handleContactRoute(
      eventWithBody({ referrer: 'https://gagnechris.com/resume' }),
      'POST',
      '/api/resume/download',
      deps,
    );
    const second = await handleContactRoute(
      eventWithBody({ referrer: 'https://gagnechris.com/resume' }),
      'POST',
      '/api/resume/download',
      deps,
    );
    expect(first?.statusCode).toBe(200);
    expect(second?.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
