import { afterEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../src/handler.js';
import { json } from '../src/http.js';
import {
  claimGroups,
  defineRoute,
  dispatchRoutes,
  tokenClientId,
  type ProtectedAuth,
  type RouteDef,
} from '../src/router.js';
import { routes } from '../src/routes.js';
import { appIdTokenClaims, makeEvent } from './support/make-event.js';

const ADMIN_CLIENT = 'test-admin-web';
const NOTEBOOK_CLIENT = 'test-notebook-web';
const LEGACY_CLIENT = 'test-legacy-web';

const idToken = (aud: string, groups: string) => ({
  sub: 'user-1',
  token_use: 'id',
  aud,
  'cognito:groups': groups,
});

const siteAdminOnly = idToken(ADMIN_CLIENT, '[site-admin]');
const notebookOnly = idToken(NOTEBOOK_CLIENT, '[notebook]');

function concretePath(pattern: string): string {
  return `/api${pattern
    .replace(/:[A-Za-z_]+\+/g, 'a/b.webp')
    .replace(/:date\b/g, '2026-10-03')
    .replace(/:area\b/g, 'work')
    .replace(/:[A-Za-z_]+/g, '01ARZ3NDEKTSV4RRFFQ69G5FAV')}`;
}

const protectedRoutes = routes.filter(
  (route): route is RouteDef & { auth: ProtectedAuth } =>
    route.auth !== 'public',
);
const routesOf = (auth: ProtectedAuth) =>
  protectedRoutes
    .filter((route) => route.auth === auth)
    .map((route) => [route.method, concretePath(route.pattern)] as const);

/** Real methods, patterns and auth with a handler that only proves the router let it through. */
const probeRoutes: RouteDef[] = protectedRoutes.map((route) =>
  defineRoute({
    method: route.method,
    pattern: route.pattern,
    auth: route.auth,
    handler: async () => json(200, { reached: true }),
  }),
);

async function probe(
  method: string,
  path: string,
  claims: Record<string, string> | undefined,
) {
  const result = await dispatchRoutes(
    probeRoutes,
    makeEvent(method, path, { jwtClaims: claims, appToken: false }),
    method,
    path,
  );
  return {
    status: result.statusCode,
    body: JSON.parse(result.body as string) as Record<string, unknown>,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('per-prefix authorization', () => {
  it('covers both prefixes', () => {
    expect(routesOf('site-admin').length).toBeGreaterThan(10);
    expect(routesOf('notebook').length).toBeGreaterThan(10);
  });

  describe('notebook-only user', () => {
    it.each(routesOf('notebook'))('%s %s → 200', async (method, path) => {
      expect((await probe(method, path, notebookOnly)).status).toBe(200);
    });

    it.each(routesOf('site-admin'))('%s %s → 403', async (method, path) => {
      const result = await probe(method, path, notebookOnly);
      expect(result.status).toBe(403);
      expect(result.body.error).toBe('forbidden');
    });
  });

  describe('site-admin-only user', () => {
    it.each(routesOf('site-admin'))('%s %s → 200', async (method, path) => {
      expect((await probe(method, path, siteAdminOnly)).status).toBe(200);
    });

    it.each(routesOf('notebook'))('%s %s → 403', async (method, path) => {
      const result = await probe(method, path, siteAdminOnly);
      expect(result.status).toBe(403);
      expect(result.body.error).toBe('forbidden');
    });
  });

  describe.each([
    ['site-admin', ADMIN_CLIENT, NOTEBOOK_CLIENT, 'site-admin'],
    ['notebook', NOTEBOOK_CLIENT, ADMIN_CLIENT, 'notebook'],
  ] as const)('%s prefix', (auth, ownClient, otherClient, group) => {
    const [method, path] = routesOf(auth)[0]!;

    it('own client without the group → 403 (group check)', async () => {
      const result = await probe(method, path, idToken(ownClient, '[]'));
      expect(result).toMatchObject({
        status: 403,
        body: { message: `Requires the ${group} group` },
      });
    });

    it('right group from the other app client → 403 (client check)', async () => {
      const result = await probe(
        method,
        path,
        idToken(otherClient, `[${group}]`),
      );
      expect(result.status).toBe(403);
    });

    it('right group from an unknown client → 403', async () => {
      expect(
        (await probe(method, path, idToken('someone-else', `[${group}]`)))
          .status,
      ).toBe(403);
    });

    it('no groups claim → 403', async () => {
      const { 'cognito:groups': _omit, ...claims } = idToken(ownClient, '');
      expect((await probe(method, path, claims)).status).toBe(403);
    });

    it('no sub → 401', async () => {
      const { sub: _omit, ...claims } = idToken(ownClient, `[${group}]`);
      expect((await probe(method, path, claims)).status).toBe(401);
      expect((await probe(method, path, undefined)).status).toBe(401);
    });

    it('access token names its client in client_id', async () => {
      const access = {
        sub: 'user-1',
        token_use: 'access',
        client_id: ownClient,
        'cognito:groups': `[${group}]`,
      };
      expect((await probe(method, path, access)).status).toBe(200);
      expect(
        (await probe(method, path, { ...access, client_id: otherClient }))
          .status,
      ).toBe(403);
    });

    it('client claim that does not match token_use → 403', async () => {
      const groups = `[${group}]`;
      const mismatched: Record<string, string>[] = [
        { sub: 'u', aud: ownClient, 'cognito:groups': groups },
        {
          sub: 'u',
          token_use: 'id',
          client_id: ownClient,
          'cognito:groups': groups,
        },
        {
          sub: 'u',
          token_use: 'access',
          aud: ownClient,
          'cognito:groups': groups,
        },
        {
          sub: 'u',
          token_use: 'refresh',
          aud: ownClient,
          'cognito:groups': groups,
        },
      ];
      for (const claims of mismatched) {
        expect((await probe(method, path, claims)).status).toBe(403);
      }
    });

    it('the admin group does not pass on an app client', async () => {
      expect(
        (await probe(method, path, idToken(ownClient, '[admin]'))).status,
      ).toBe(403);
    });

    it('unset app client env var fails closed', async () => {
      vi.stubEnv(
        auth === 'site-admin'
          ? 'ADMIN_WEB_CLIENT_ID'
          : 'NOTEBOOK_WEB_CLIENT_ID',
        '',
      );
      expect(
        (await probe(method, path, idToken('', `[${group}]`))).status,
      ).toBe(403);
    });
  });
});

describe('only the two app clients are trusted', () => {
  const both = [...routesOf('site-admin'), ...routesOf('notebook')];

  // A stale env var left on the Lambda must not reopen a third client.
  it.each(both)(
    'AUTH_LEGACY_WEB_CLIENT_ID is ignored: web client + admin → 403 on %s %s',
    async (method, path) => {
      vi.stubEnv('AUTH_LEGACY_WEB_CLIENT_ID', LEGACY_CLIENT);
      for (const groups of ['[admin]', '[admin site-admin notebook]']) {
        expect(
          (await probe(method, path, idToken(LEGACY_CLIENT, groups))).status,
        ).toBe(403);
      }
    },
  );
});

describe('real handlers', () => {
  const call = async (
    method: string,
    path: string,
    claims: Record<string, string>,
  ) =>
    (await handler(
      makeEvent(method, path, { jwtClaims: claims, appToken: false }),
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string };

  it('GET /api/admin/me: site-admin 200, notebook-only 403', async () => {
    expect((await call('GET', '/api/admin/me', siteAdminOnly)).statusCode).toBe(
      200,
    );
    expect((await call('GET', '/api/admin/me', notebookOnly)).statusCode).toBe(
      403,
    );
  });

  it('public routes ignore tokens', async () => {
    const result = (await handler(
      makeEvent('GET', '/api/health'),
      {} as never,
      () => undefined,
    )) as { statusCode: number };
    expect(result.statusCode).toBe(200);
  });

  it('test events default to the path’s app token', () => {
    expect(appIdTokenClaims('notebook')).toEqual({
      token_use: 'id',
      aud: NOTEBOOK_CLIENT,
      'cognito:groups': '[notebook]',
    });
  });
});

describe('claim parsing', () => {
  it('cognito:groups: JSON arrays and the gateway bracket form only', () => {
    expect(claimGroups(undefined)).toEqual([]);
    expect(claimGroups('')).toEqual([]);
    expect(claimGroups('[]')).toEqual([]);
    expect(claimGroups('[site-admin]')).toEqual(['site-admin']);
    expect(claimGroups('[editors  notebook]')).toEqual(['editors', 'notebook']);
    expect(claimGroups(' [notebook]\n')).toEqual(['notebook']);
    expect(claimGroups('["site-admin","notebook"]')).toEqual([
      'site-admin',
      'notebook',
    ]);
    expect(claimGroups('[administrators]')).not.toContain('admin');
  });

  it('cognito:groups: commas are part of a group name, never a separator', () => {
    expect(claimGroups('[editors,site-admin]')).toEqual(['editors,site-admin']);
    expect(claimGroups('editors,site-admin')).toEqual([]);
    expect(claimGroups('site-admin')).toEqual([]);
  });

  it('cognito:groups: malformed values are no groups', () => {
    expect(claimGroups('["site-admin"')).toEqual([]);
    expect(claimGroups('["site-admin", 1]')).toEqual([]);
    expect(claimGroups('[site-admin] [notebook]')).toEqual([]);
    expect(claimGroups('[a "b"]')).toEqual([]);
  });

  it('array claims from a raw event stay parseable', async () => {
    const event = makeEvent('GET', '/api/admin/me', {
      jwtClaims: { sub: 'u', token_use: 'id', aud: ADMIN_CLIENT },
      appToken: false,
    });
    const jwt = (
      event.requestContext as unknown as {
        authorizer: { jwt: { claims: Record<string, unknown> } };
      }
    ).authorizer.jwt;
    jwt.claims['cognito:groups'] = ['editors', 'site-admin'];
    const result = (await handler(event, {} as never, () => undefined)) as {
      statusCode: number;
    };
    expect(result.statusCode).toBe(200);
  });

  it('tokenClientId reads aud for ID tokens and client_id for access tokens', () => {
    expect(tokenClientId({ token_use: 'id', aud: 'a', client_id: 'c' })).toBe(
      'a',
    );
    expect(
      tokenClientId({ token_use: 'access', aud: 'a', client_id: 'c' }),
    ).toBe('c');
    expect(tokenClientId({ aud: 'a', client_id: 'c' })).toBeUndefined();
    expect(tokenClientId(undefined)).toBeUndefined();
  });
});
