import type { Claims } from './api.js';

export type App = 'admin' | 'notebook' | 'ios';

export function clientId(app: App): string {
  const name = {
    admin: 'ADMIN_WEB_CLIENT_ID',
    notebook: 'NOTEBOOK_WEB_CLIENT_ID',
    ios: 'IOS_CLIENT_ID',
  }[app];
  const id = process.env[name];
  if (!id) throw new Error(`${name} is not set`);
  return id;
}

/**
 * Cognito ID token claims as API Gateway passes them: `cognito:groups` is a
 * bracketed, space-separated string, `auth_time` epoch seconds.
 */
export function idToken(
  sub: string,
  app: App,
  groups: readonly string[],
  over: Claims = {},
): Claims {
  return {
    sub,
    email: `${sub}@example.com`,
    'cognito:username': sub,
    token_use: 'id',
    aud: clientId(app),
    'cognito:groups': `[${groups.join(' ')}]`,
    auth_time: String(Math.floor(Date.now() / 1000)),
    ...over,
  };
}

export const notebookUser = (sub: string, over?: Claims) =>
  idToken(sub, 'notebook', ['notebook'], over);

export const siteAdmin = (sub = 'site-admin', over?: Claims) =>
  idToken(sub, 'admin', ['site-admin'], over);

export const userAdmin = (sub = 'user-admin', over?: Claims) =>
  idToken(sub, 'admin', ['user-admin'], over);
