export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787';

const DEFAULT_LOCAL_GROUPS = ['site-admin', 'notebook', 'user-admin'];

export function parseGroups(raw: string | undefined): readonly string[] {
  if (raw === undefined) return DEFAULT_LOCAL_GROUPS;
  return raw
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean);
}

/** Local fake auth: `EXPO_PUBLIC_LOCAL_AUTH_GROUPS=site-admin` signs in without Notebook. */
export const localAuthGroups = parseGroups(
  process.env.EXPO_PUBLIC_LOCAL_AUTH_GROUPS as string | undefined,
);

export type AuthMode = 'local' | 'cognito';

const isLocalApi = (url: string) =>
  /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);

/**
 * `local` (the local API's fake tokens) only in dev builds, so a release build
 * can never ship it. Unset, it follows the API: local API, local auth.
 */
export function resolveAuthMode(
  raw: string | undefined,
  api: string,
  dev: boolean,
): AuthMode {
  const wanted = raw === 'local' || raw === 'cognito' ? raw : null;
  const mode = wanted ?? (isLocalApi(api) ? 'local' : 'cognito');
  return mode === 'local' && dev ? 'local' : 'cognito';
}

export const authMode = resolveAuthMode(
  process.env.EXPO_PUBLIC_AUTH_MODE as string | undefined,
  apiBaseUrl,
  typeof __DEV__ === 'boolean' ? __DEV__ : false,
);

/** The `ios` app client is public (PKCE, no secret); SSM `/gagnechris/prod/cognito-ios-client-id`. */
const IOS_CLIENT_ID = '4abm22if5quulq4paaelcsmbmm';

/**
 * Where managed login sends the code back. `universalLink` needs a build with
 * the notebook host's `webcredentials` entitlement and the AASA served;
 * simulator and dev builds use `scheme`.
 */
export const IOS_AUTH_REDIRECTS = {
  scheme: {
    redirectUri: 'gagnechris://auth/callback',
    logoutUri: 'gagnechris://',
    preferUniversalLinks: false,
  },
  universalLink: {
    redirectUri: 'https://notebook.gagnechris.com/ios/auth/callback',
    logoutUri: 'https://notebook.gagnechris.com/ios/auth/signed-out',
    preferUniversalLinks: true,
  },
} as const;

export type CognitoConfig = {
  domain: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
  preferUniversalLinks: boolean;
  /**
   * An ephemeral `ASWebAuthenticationSession` keeps no managed-login cookie,
   * so sign-out needs no `/logout`. Turned off, the session is shared and
   * sign-out also opens `/logout`.
   */
  ephemeralSession: boolean;
};

export const cognitoConfig: CognitoConfig = {
  domain: process.env.EXPO_PUBLIC_COGNITO_DOMAIN ?? 'auth.gagnechris.com',
  clientId: process.env.EXPO_PUBLIC_COGNITO_IOS_CLIENT_ID || IOS_CLIENT_ID,
  ...IOS_AUTH_REDIRECTS.scheme,
  ephemeralSession: true,
};
