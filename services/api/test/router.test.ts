import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { handler } from '../src/handler.js';
import {
  canonicalPath,
  dispatchRoutes,
  matchPattern,
  type RouteDef,
} from '../src/router.js';
import { json } from '../src/http.js';
import { makeEvent } from './support/make-event.js';

describe('router helpers', () => {
  it('canonicalPath strips /api prefix', () => {
    expect(canonicalPath('/api/admin/posts')).toBe('/admin/posts');
    expect(canonicalPath('/admin/posts')).toBe('/admin/posts');
    expect(canonicalPath('/api')).toBe('/');
    expect(canonicalPath('/api/')).toBe('/');
  });

  it('matchPattern captures :id and :key+', () => {
    expect(matchPattern('/admin/posts/:id', '/admin/posts/abc')).toEqual({
      id: 'abc',
    });
    expect(
      matchPattern(
        '/admin/media/objects/:key+',
        '/admin/media/objects/2026/09/file.webp',
      ),
    ).toEqual({ key: '2026/09/file.webp' });
    expect(matchPattern('/admin/posts/:id', '/admin/posts')).toBeNull();
  });
});

describe('dispatchRoutes', () => {
  const echoRoutes: RouteDef[] = [
    {
      method: 'GET',
      pattern: '/echo/:id',
      auth: 'public',
      handler: async (ctx, { params }) =>
        json(200, { id: params.id, userId: ctx.userId ?? null }),
    },
    {
      method: 'POST',
      pattern: '/echo/:id',
      auth: 'admin',
      body: z.object({ name: z.string().min(1) }),
      handler: async (ctx, { body }) =>
        json(200, {
          name: (body as { name: string }).name,
          userId: ctx.userId,
        }),
    },
  ];

  it('returns 405 for known path with wrong method', async () => {
    const result = await dispatchRoutes(
      echoRoutes,
      makeEvent('DELETE', '/api/echo/1'),
      'DELETE',
      '/api/echo/1',
    );
    expect(result?.statusCode).toBe(405);
    const body = JSON.parse(result!.body as string);
    expect(body.error).toBe('method_not_allowed');
  });

  it('returns 404 for unknown path', async () => {
    const result = await dispatchRoutes(
      echoRoutes,
      makeEvent('GET', '/api/nope'),
      'GET',
      '/api/nope',
    );
    expect(result?.statusCode).toBe(404);
  });

  it('validates body with zod and returns 400', async () => {
    const result = await dispatchRoutes(
      echoRoutes,
      makeEvent('POST', '/api/echo/1', {
        jwtClaims: { sub: 'u1' },
        body: { name: '' },
      }),
      'POST',
      '/api/echo/1',
    );
    expect(result?.statusCode).toBe(400);
    const body = JSON.parse(result!.body as string);
    expect(body.error).toBe('bad_request');
    expect(body.fields?.name).toBeDefined();
  });

  it('passes ctx.userId from JWT claims', async () => {
    const result = await dispatchRoutes(
      echoRoutes,
      makeEvent('POST', '/api/echo/1', {
        jwtClaims: { sub: 'user-42' },
        body: { name: 'hi' },
      }),
      'POST',
      '/api/echo/1',
    );
    expect(result?.statusCode).toBe(200);
    expect(JSON.parse(result!.body as string)).toEqual({
      name: 'hi',
      userId: 'user-42',
    });
  });

  it('rejects admin routes without claims when enforceAuth', async () => {
    const result = await dispatchRoutes(
      echoRoutes,
      makeEvent('POST', '/api/echo/1', { body: { name: 'hi' } }),
      'POST',
      '/api/echo/1',
    );
    expect(result?.statusCode).toBe(401);
  });
});

describe('api handler routing', () => {
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

  it('GET /api/admin/me without claims is 401', async () => {
    const result = await handler(
      makeEvent('GET', '/api/admin/me'),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({ statusCode: 401 });
  });

  it('wrong method on /api/health is 405', async () => {
    const result = await handler(
      makeEvent('POST', '/api/health'),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({ statusCode: 405 });
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
