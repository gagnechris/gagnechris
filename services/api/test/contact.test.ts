import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handleContactRoute } from '../src/contact/handlers.js';
import { setSesClient } from '../src/contact/mail.js';

function eventWithBody(body: unknown): APIGatewayProxyEventV2 {
  return {
    body: JSON.stringify(body),
    isBase64Encoded: false,
    headers: { 'user-agent': 'vitest' },
  } as unknown as APIGatewayProxyEventV2;
}

describe('contact routes', () => {
  afterEach(() => {
    setSesClient(undefined);
    delete process.env.CONTACT_TO_EMAIL;
    delete process.env.CONTACT_FROM_EMAIL;
    delete process.env.SITE_APEX_DOMAIN;
  });

  it('rejects invalid contact bodies', async () => {
    const res = await handleContactRoute(
      eventWithBody({ name: '', email: 'nope', message: '' }),
      'POST',
      '/api/contact',
    );
    expect(res?.statusCode).toBe(400);
  });

  it('silently accepts honeypot fills without sending', async () => {
    const send = vi.fn();
    setSesClient({ send } as never);
    process.env.CONTACT_TO_EMAIL = 'you@example.com';
    process.env.CONTACT_FROM_EMAIL = 'noreply@gagnechris.com';
    const res = await handleContactRoute(
      eventWithBody({
        name: 'Bot',
        email: 'bot@example.com',
        message: 'spam',
        website: 'http://spam.example',
      }),
      'POST',
      '/api/contact',
    );
    expect(res?.statusCode).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends contact mail for valid submissions', async () => {
    const send = vi.fn(async () => ({}));
    setSesClient({ send } as never);
    process.env.CONTACT_TO_EMAIL = 'you@example.com';
    process.env.CONTACT_FROM_EMAIL = 'noreply@gagnechris.com';
    process.env.SITE_APEX_DOMAIN = 'gagnechris.com';
    const res = await handleContactRoute(
      eventWithBody({
        name: 'Chris',
        email: 'visitor@example.com',
        message: 'Hello',
        website: '',
      }),
      'POST',
      '/api/contact',
    );
    expect(res?.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('notifies on resume download', async () => {
    const send = vi.fn(async () => ({}));
    setSesClient({ send } as never);
    process.env.CONTACT_TO_EMAIL = 'you@example.com';
    process.env.CONTACT_FROM_EMAIL = 'noreply@gagnechris.com';
    const res = await handleContactRoute(
      eventWithBody({ referrer: 'https://gagnechris.com/resume' }),
      'POST',
      '/api/resume/download',
    );
    expect(res?.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
