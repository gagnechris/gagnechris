const DEFAULT_CLAIMS = {
  sub: 'local-dev-user',
  email: 'local@gagnechris.com',
  'cognito:username': 'local-admin',
  // Same shape API Gateway passes array claims in.
  'cognito:groups': '[admin]',
};

const LOCAL_TOKEN = /^Bearer local:([A-Za-z0-9_-]{1,64})$/;

/**
 * `Bearer local:<sub>` signs in as another admin so owner-scoped data can be
 * checked across users; anything else (no header, `local-dev-token`) is the
 * default local user.
 */
export function localClaims(authorization: string | undefined) {
  const sub = authorization?.match(LOCAL_TOKEN)?.[1];
  if (!sub || sub === DEFAULT_CLAIMS.sub) return DEFAULT_CLAIMS;
  return {
    ...DEFAULT_CLAIMS,
    sub,
    email: `${sub}@local.gagnechris.com`,
    'cognito:username': sub,
  };
}
