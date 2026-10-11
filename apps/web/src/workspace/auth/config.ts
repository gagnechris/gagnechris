import { Amplify } from 'aws-amplify';
// Required on the /auth/callback page load: exchanges ?code= for tokens.
// signInWithRedirect also imports this, but that module is not on the callback chunk.
import 'aws-amplify/auth/enable-oauth-listener';

let clientId: string | undefined;
let configured = false;

/**
 * Each app has its own Cognito client, registered only for its own host. Call
 * from the app entry before rendering.
 */
export const setAuthClientId = (id: string | undefined): void => {
  clientId = id;
};

const requireValue = (name: string, value: string | undefined): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is not set`);
  }
  return value;
};

/** Cognito managed-login (auth code + PKCE). Call before any Auth API. */
export const ensureAmplifyConfigured = (): void => {
  if (configured) {
    return;
  }

  const userPoolId = requireValue(
    'VITE_COGNITO_USER_POOL_ID',
    import.meta.env.VITE_COGNITO_USER_POOL_ID,
  );
  const userPoolClientId = requireValue('Cognito app client ID', clientId);
  const domain = requireValue(
    'VITE_COGNITO_AUTH_DOMAIN',
    import.meta.env.VITE_COGNITO_AUTH_DOMAIN,
  );
  const origin = window.location.origin;

  // Tokens stay in Amplify's default localStorage store: per origin, so the
  // public site and the other app can't read them.
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          oauth: {
            domain,
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [`${origin}/auth/callback`],
            redirectSignOut: [`${origin}/`],
            responseType: 'code',
          },
        },
      },
    },
  });

  configured = true;
};

const managedLoginUrl = (
  path: string,
  extra: Record<string, string> = {},
): string => {
  const domain = requireValue(
    'VITE_COGNITO_AUTH_DOMAIN',
    import.meta.env.VITE_COGNITO_AUTH_DOMAIN,
  );
  const params = new URLSearchParams({
    client_id: requireValue('Cognito app client ID', clientId),
    redirect_uri: `${window.location.origin}/auth/callback`,
    ...extra,
  });
  return `https://${domain}${path}?${params.toString()}`;
};

/**
 * Managed login's add-passkey page for this app's client. It returns to the
 * sign-in callback, which goes back to the saved page while the session is
 * live.
 */
export const addPasskeyUrl = (): string => managedLoginUrl('/passkeys/add');

/**
 * A sign-in that only renews the managed-login session cookie
 * `/passkeys/add` needs. Amplify didn't start it, so its OAuth listener leaves
 * the returned code alone and the app keeps its tokens.
 */
export const renewManagedLoginUrl = (): string =>
  managedLoginUrl('/oauth2/authorize', {
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'login',
  });
