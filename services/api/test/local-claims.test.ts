import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLocalAuthEnv, localClaims } from '../local/claims.js';
import { authorize } from '../src/router.js';

const env = {
  ADMIN_WEB_CLIENT_ID: 'local-admin-web',
  NOTEBOOK_WEB_CLIENT_ID: 'local-notebook-web',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('local API fake claims', () => {
  it.each([undefined, 'Bearer local-dev-token', 'Bearer local:local-dev-user'])(
    'uses the default user for %s',
    (header) => {
      expect(localClaims(header, 'site-admin', env)).toMatchObject({
        sub: 'local-dev-user',
        email: 'local@gagnechris.com',
      });
    },
  );

  it('signs in as the sub named in a local token', () => {
    expect(
      localClaims('Bearer local:e2e-second', 'notebook', env),
    ).toMatchObject({ sub: 'e2e-second', 'cognito:groups': '[notebook]' });
  });

  it.each(['Bearer local:', 'Bearer local:a b', 'Bearer local:../x'])(
    'rejects a malformed sub in %s',
    (header) => {
      expect(localClaims(header, 'site-admin', env).sub).toBe('local-dev-user');
    },
  );

  it('injects an ID token for the route’s app with only that app’s group', () => {
    expect(localClaims(undefined, 'site-admin', env)).toMatchObject({
      token_use: 'id',
      aud: 'local-admin-web',
      'cognito:groups': '[site-admin]',
    });
    expect(localClaims(undefined, 'notebook', env)).toMatchObject({
      token_use: 'id',
      aud: 'local-notebook-web',
      'cognito:groups': '[notebook]',
    });
    expect(localClaims(undefined, 'user-admin', env)).toMatchObject({
      token_use: 'id',
      aud: 'local-admin-web',
      'cognito:groups': '[user-admin]',
    });
  });

  it('the injected claims pass the router once the local env is applied', () => {
    vi.stubEnv('ADMIN_WEB_CLIENT_ID', '');
    vi.stubEnv('NOTEBOOK_WEB_CLIENT_ID', '');
    applyLocalAuthEnv();
    expect(process.env).toMatchObject(env);
    for (const auth of ['site-admin', 'user-admin', 'notebook'] as const) {
      expect(authorize(auth, localClaims(undefined, auth))).toEqual({
        ok: true,
      });
    }
    expect(
      authorize('notebook', localClaims(undefined, 'site-admin')),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('keeps client IDs already in the environment', () => {
    const local: NodeJS.ProcessEnv = { ADMIN_WEB_CLIENT_ID: 'real-id' };
    applyLocalAuthEnv(local);
    expect(local.ADMIN_WEB_CLIENT_ID).toBe('real-id');
  });
});
