import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  pathRequiresAdminAuth,
  patternSpecificity,
  routePatternToOpenApiPath,
  type RouteDef,
} from '../src/router.js';
import { routes } from '../src/routes.js';
import { makeEvent } from './support/make-event.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  it('pathRequiresAdminAuth does not throw on malformed % escapes (CHR-166)', () => {
    expect(pathRequiresAdminAuth(routes, '/api/admin/posts/%E0')).toBe(false);
    expect(pathRequiresAdminAuth(routes, '/api/echo/%E0')).toBe(false);
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
      auth: 'admin',
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
        // Response schema failure — server bug, must not look like 400 (CHR-168).
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

  it('prefers literal segments over :param (CHR-154)', async () => {
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

  it('lets response-schema ZodError bubble (handler turns it into 500) (CHR-168)', async () => {
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

describe('route table contract (CHR-154 / CHR-166)', () => {
  const stackSrc = readFileSync(
    join(__dirname, '../../../infra/lib/stacks/api-stack.ts'),
    'utf8',
  );

  it('admin routes use exactly the API Gateway JWT prefixes', () => {
    for (const route of routes) {
      if (route.auth !== 'admin') continue;
      expect(
        isJwtProtectedPath(route.pattern.split('/:')[0]!) ||
          isJwtProtectedPath(route.pattern),
      ).toBe(true);
      expect(
        API_GATEWAY_JWT_PREFIXES.some(
          (prefix) =>
            route.pattern === prefix || route.pattern.startsWith(`${prefix}/`),
        ),
      ).toBe(true);
    }

    for (const prefix of API_GATEWAY_JWT_PREFIXES) {
      expect(stackSrc).toContain(`path: '/api${prefix}/{proxy+}'`);
      expect(stackSrc).toContain(`path: '/api${prefix}'`);
    }
  });

  it('rejects the three public/JWT misconfigurations (CHR-166)', () => {
    // 1. Public route under a JWT prefix → gateway 401 in prod.
    for (const route of routes) {
      if (route.auth !== 'public') continue;
      expect(
        isJwtProtectedPath(route.pattern),
        `public route ${route.method} ${route.pattern} must not sit under JWT prefixes`,
      ).toBe(false);
    }

    // 2. Extra JWT path in the stack beyond API_GATEWAY_JWT_PREFIXES.
    const stackLines = stackSrc.split('\n');
    const jwtPathBlocks: string[] = [];
    for (let i = 0; i < stackLines.length; i++) {
      if (!stackLines[i]!.includes('authorizer: jwtAuthorizer')) continue;
      for (let j = i; j >= Math.max(0, i - 12); j--) {
        const pathMatch = stackLines[j]!.match(/path:\s*'([^']+)'/);
        if (pathMatch) {
          jwtPathBlocks.push(pathMatch[1]!);
          break;
        }
      }
    }
    const expectedJwtPaths = new Set(
      API_GATEWAY_JWT_PREFIXES.flatMap((prefix) => [
        `/api${prefix}`,
        `/api${prefix}/{proxy+}`,
      ]),
    );
    for (const path of jwtPathBlocks) {
      expect(
        expectedJwtPaths.has(path),
        `unexpected JWT path in api-stack.ts: ${path}`,
      ).toBe(true);
    }
    expect(jwtPathBlocks.sort()).toEqual([...expectedJwtPaths].sort());

    // 3. Public route with no API Gateway route → 404 in prod (no $default).
    for (const route of routes) {
      if (route.auth !== 'public') continue;
      // Static public routes are registered as exact `/api…` paths (no params).
      expect(
        route.pattern.includes(':'),
        `public route ${route.pattern} must be an exact gateway path`,
      ).toBe(false);
      const apiPath = `/api${route.pattern === '/' ? '' : route.pattern}`;
      expect(
        stackSrc.includes(`path: '${apiPath}'`),
        `public route ${route.method} ${route.pattern} missing addRoutes in api-stack.ts`,
      ).toBe(true);
      // Method appears in the same addRoutes block (best-effort: nearby HttpMethod).
      const pathIdx = stackSrc.indexOf(`path: '${apiPath}'`);
      const block = stackSrc.slice(pathIdx, pathIdx + 200);
      expect(
        block.includes(`HttpMethod.${route.method}`),
        `public route ${route.method} ${apiPath} method missing near addRoutes path`,
      ).toBe(true);
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
