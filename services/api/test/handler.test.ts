import { describe, expect, it } from 'vitest';
import { handler } from '../src/handler.js';
import { makeEvent } from './support/make-event.js';

describe('api handler', () => {
  it('GET /api/health returns ok', async () => {
    const result = await handler(
      makeEvent('GET', '/api/health'),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({
      statusCode: 200,
      body: JSON.stringify({ status: 'ok', service: 'gagnechris-api' }),
    });
  });

  it('GET /api/admin/me returns claims', async () => {
    const result = await handler(
      makeEvent('GET', '/api/admin/me', {
        jwtClaims: {
          sub: 'abc-123',
          email: 'admin@example.com',
          'cognito:username': 'admin@example.com',
        },
      }),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({ statusCode: 200 });
    const body = JSON.parse((result as { body: string }).body);
    expect(body).toEqual({
      sub: 'abc-123',
      email: 'admin@example.com',
      username: 'admin@example.com',
    });
  });

  it('unknown route is 404', async () => {
    const result = await handler(
      makeEvent('GET', '/api/nope'),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('does not set CORS headers (API Gateway corsPreflight owns that)', async () => {
    const result = await handler(
      makeEvent('GET', '/api/health'),
      {} as never,
      () => undefined,
    );
    const headers =
      (result as { headers?: Record<string, string> }).headers ?? {};
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
