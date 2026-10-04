import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildOpenApiDocument } from '@gagnechris/shared/openapi';
import { handler } from '../src/handler.js';
import { json } from '../src/http.js';
import {
  API_GATEWAY_JWT_PREFIXES,
  canonicalPath,
  defineRoute,
  dispatchRoutes,
  isJwtProtectedPath,
  matchPattern,
  AUTH_POLICIES,
  routeAuthForPath,
  patternSpecificity,
  routePatternToOpenApiPath,
  type RouteDef,
} from '../src/router.js';
import { routes } from '../src/routes.js';
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

  it('patternSpecificity counts literal segments', () => {
    expect(patternSpecificity('/notebook/tasks/today')).toBe(3);
    expect(patternSpecificity('/notebook/tasks/:id')).toBe(2);
  });

  it('routeAuthForPath does not throw on malformed % escapes', () => {
    expect(routeAuthForPath(routes, '/api/admin/posts/%E0')).toBeUndefined();
    expect(routeAuthForPath(routes, '/api/echo/%E0')).toBeUndefined();
  });

  it('routeAuthForPath returns the matched route’s auth', () => {
    expect(routeAuthForPath(routes, '/api/admin/posts')).toBe('site-admin');
    expect(routeAuthForPath(routes, '/api/notebook/notes')).toBe('notebook');
    expect(routeAuthForPath(routes, '/api/health')).toBeUndefined();
  });
});

describe('dispatchRoutes', () => {
  const echoRoutes: RouteDef[] = [
    defineRoute({
      method: 'GET',
      pattern: '/echo/:id',
      auth: 'public',
      handler: async (ctx, { params }) =>
        json(200, { id: params.id, userId: ctx.userId ?? null }),
    }),
    defineRoute({
      method: 'POST',
      pattern: '/echo/:id',
      auth: 'site-admin',
      body: z.object({ name: z.string().min(1) }),
      handler: async (ctx, { body }) =>
        json(200, {
          name: body.name,
          userId: ctx.userId,
        }),
    }),
    defineRoute({
      method: 'GET',
      pattern: '/broken-response',
      auth: 'public',
      handler: async () => {
        // Response schema failure is a server bug and must not look like 400.
        z.object({ ok: z.literal(true) }).parse({ ok: false });
        return json(200, { ok: true });
      },
    }),
  ];

  it('returns 405 with Allow for known path with wrong method', async () => {
    const result = await dispatchRoutes(
      echoRoutes,
      makeEvent('DELETE', '/api/echo/1'),
      'DELETE',
      '/api/echo/1',
    );
    expect(result.statusCode).toBe(405);
    expect(result.headers?.Allow).toBe('GET, POST');
    const body = JSON.parse(result.body as string);
    expect(body.error).toBe('method_not_allowed');
  });

  it('returns 404 for unknown path', async () => {
    const result = await dispatchRoutes(
      echoRoutes,
      makeEvent('GET', '/api/nope'),
      'GET',
      '/api/nope',
    );
    expect(result.statusCode).toBe(404);
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
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body as string);
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
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({
      name: 'hi',
      userId: 'user-42',
    });
  });

  it('rejects admin routes without claims', async () => {
    const result = await dispatchRoutes(
      echoRoutes,
      makeEvent('POST', '/api/echo/1', { body: { name: 'hi' } }),
      'POST',
      '/api/echo/1',
    );
    expect(result.statusCode).toBe(401);
  });

  it('prefers literal segments over :param', async () => {
    const table: RouteDef[] = [
      defineRoute({
        method: 'GET',
        pattern: '/notebook/tasks/:id',
        auth: 'public',
        handler: async (_ctx, { params }) =>
          json(200, { kind: 'id', ...params }),
      }),
      defineRoute({
        method: 'GET',
        pattern: '/notebook/tasks/today',
        auth: 'public',
        handler: async () => json(200, { kind: 'today' }),
      }),
    ];
    const result = await dispatchRoutes(
      table,
      makeEvent('GET', '/api/notebook/tasks/today'),
      'GET',
      '/api/notebook/tasks/today',
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body as string)).toEqual({ kind: 'today' });
  });

  it('returns 400 for malformed percent-encoding in path params', async () => {
    const result = await dispatchRoutes(
      echoRoutes,
      makeEvent('GET', '/api/echo/%E0'),
      'GET',
      '/api/echo/%E0',
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body as string).error).toBe('bad_request');
  });

  it('lets response-schema ZodError bubble (handler turns it into 500)', async () => {
    await expect(
      dispatchRoutes(
        echoRoutes,
        makeEvent('GET', '/api/broken-response'),
        'GET',
        '/api/broken-response',
      ),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof z.ZodError || (err as Error)?.name === 'ZodError',
    );
  });
});

describe('route table contract', () => {
  it('every /admin route is site-admin and every /notebook route is notebook', () => {
    expect(AUTH_POLICIES['site-admin'].prefix).toBe('/admin');
    expect(AUTH_POLICIES.notebook.prefix).toBe('/notebook');
    expect(
      Object.values(AUTH_POLICIES)
        .map((policy) => policy.prefix)
        .sort(),
    ).toEqual([...API_GATEWAY_JWT_PREFIXES].sort());
    for (const route of routes) {
      for (const [auth, policy] of Object.entries(AUTH_POLICIES)) {
        const underPrefix =
          route.pattern === policy.prefix ||
          route.pattern.startsWith(`${policy.prefix}/`);
        expect(
          underPrefix ? route.auth === auth : route.auth !== auth,
          `${route.method} ${route.pattern} has auth '${route.auth}'`,
        ).toBe(true);
      }
      if (route.auth !== 'public') {
        expect(isJwtProtectedPath(route.pattern)).toBe(true);
      }
    }
  });

  it('every /admin/projects route is site-admin', () => {
    const projectRoutes = routes
      .filter(
        (r) =>
          r.pattern === '/admin/projects' ||
          r.pattern.startsWith('/admin/projects/'),
      )
      .map((r) => `${r.method} ${r.pattern} ${r.auth}`)
      .sort();
    expect(projectRoutes).toEqual(
      [
        'GET /admin/projects',
        'POST /admin/projects',
        'GET /admin/projects/:id',
        'PUT /admin/projects/:id',
        'DELETE /admin/projects/:id',
        'POST /admin/projects/:id/publish',
        'POST /admin/projects/:id/unpublish',
        'POST /admin/projects/:id/discard',
      ]
        .map((r) => `${r} site-admin`)
        .sort(),
    );
  });

  it('rejects public routes under JWT prefixes', () => {
    for (const route of routes) {
      if (route.auth !== 'public') continue;
      expect(
        isJwtProtectedPath(route.pattern),
        `public route ${route.method} ${route.pattern} must not sit under JWT prefixes`,
      ).toBe(false);
      // Static public routes are registered as exact `/api…` paths (no params).
      // Gateway registration is asserted on the synthesized template (infra).
      expect(
        route.pattern.includes(':'),
        `public route ${route.pattern} must be an exact gateway path`,
      ).toBe(false);
    }
  });

  it('every RouteDef has a matching OpenAPI operation and vice versa', () => {
    const doc = buildOpenApiDocument();
    const openApiKeys = new Set<string>();
    for (const [path, methods] of Object.entries(doc.paths ?? {})) {
      for (const method of Object.keys(methods as object)) {
        if (method.startsWith('x-')) continue;
        openApiKeys.add(`${method.toUpperCase()} ${path}`);
      }
    }

    const routeKeys = new Set(
      routes.map((r) => `${r.method} ${routePatternToOpenApiPath(r.pattern)}`),
    );

    for (const key of routeKeys) {
      expect(openApiKeys.has(key), `missing OpenAPI op for ${key}`).toBe(true);
    }
    for (const key of openApiKeys) {
      expect(routeKeys.has(key), `extra OpenAPI op ${key}`).toBe(true);
    }
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

  it('wrong method on /api/health is 405 with Allow', async () => {
    const result = await handler(
      makeEvent('POST', '/api/health'),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({ statusCode: 405 });
    expect(
      (result as { headers?: Record<string, string> }).headers?.Allow,
    ).toBe('GET');
  });

  it('unknown route is 404', async () => {
    const result = await handler(
      makeEvent('GET', '/api/nope'),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('malformed escape on admin path is 400', async () => {
    const result = await handler(
      makeEvent('GET', '/api/admin/posts/%E0', {
        jwtClaims: { sub: 'u1' },
      }),
      {} as never,
      () => undefined,
    );
    expect(result).toMatchObject({ statusCode: 400 });
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
