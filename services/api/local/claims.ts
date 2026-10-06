import { AUTH_POLICIES, type ProtectedAuth } from '../src/router.js';

const LOCAL_CLIENT_IDS: Record<ProtectedAuth, string> = {
  'site-admin': 'local-admin-web',
  'user-admin': 'local-admin-web',
  notebook: 'local-notebook-web',
};

/** The router compares `aud` with these env vars, so the local API sets them before serving. */
export function applyLocalAuthEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const auth of Object.keys(LOCAL_CLIENT_IDS) as ProtectedAuth[]) {
    const name = AUTH_POLICIES[auth].clientIdEnv;
    env[name] ||= LOCAL_CLIENT_IDS[auth];
  }
}

const DEFAULT_USER = {
  sub: 'local-dev-user',
  email: 'local@gagnechris.com',
  'cognito:username': 'local-admin',
};

const LOCAL_TOKEN = /^Bearer local:([A-Za-z0-9_-]{1,64})$/;

/**
 * An ID token for the app that owns `auth`, with only that app's group.
 * `Bearer local:<sub>` signs in as another user so owner-scoped data can be
 * checked across users; anything else (no header, `local-dev-token`) is the
 * default local user.
 */
export function localClaims(
  authorization: string | undefined,
  auth: ProtectedAuth,
  env: NodeJS.ProcessEnv = process.env,
) {
  const policy = AUTH_POLICIES[auth];
  const app = {
    token_use: 'id',
    aud: env[policy.clientIdEnv] || LOCAL_CLIENT_IDS[auth],
    // Same shape API Gateway passes array claims in.
    'cognito:groups': `[${policy.group}]`,
  };
  const sub = authorization?.match(LOCAL_TOKEN)?.[1];
  if (!sub || sub === DEFAULT_USER.sub) return { ...DEFAULT_USER, ...app };
  return {
    ...DEFAULT_USER,
    ...app,
    sub,
    email: `${sub}@local.gagnechris.com`,
    'cognito:username': sub,
  };
}
