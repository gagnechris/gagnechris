import type { SessionUser } from '../session';
import type { TokenIssuer } from './backend';

const LOCAL_TOKEN = /^local-ios:([A-Za-z0-9_-]{1,64})$/;

/**
 * The local API's fake auth (`npm run local:dev`): `Bearer local-ios:<sub>`
 * gets ID token claims with the `ios` client as `aud`, like the web's
 * `VITE_AUTH_MODE=local`. Tokens never expire, and they live in the Keychain
 * like real ones, so relaunch and sign-out run the same code as Cognito.
 */
export function localIssuer(
  groups: readonly string[],
  sub = 'local-dev-user',
): TokenIssuer {
  const token = `local-ios:${sub}`;
  return {
    signIn: async () => ({
      idToken: token,
      refreshToken: `local-refresh:${sub}`,
    }),
    refresh: async (refreshToken) => ({ idToken: token, refreshToken }),
    revoke: async () => {},
    endSession: async () => {},
    user: (idToken): SessionUser | null => {
      const match = idToken.match(LOCAL_TOKEN);
      if (!match) return null;
      return {
        sub: match[1]!,
        email:
          match[1] === 'local-dev-user'
            ? 'local@gagnechris.com'
            : `${match[1]}@local.gagnechris.com`,
        name: match[1] === 'local-dev-user' ? 'Local Admin' : null,
        groups,
      };
    },
    expiresAt: () => Number.POSITIVE_INFINITY,
  };
}
