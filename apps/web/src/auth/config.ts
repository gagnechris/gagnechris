import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { CookieStorage } from 'aws-amplify/utils';
// Required on the /auth/callback page load: exchanges ?code= for tokens.
// signInWithRedirect also imports this, but that module is not on the callback chunk.
import 'aws-amplify/auth/enable-oauth-listener';

let configured = false;

const requireEnv = (name: keyof ImportMetaEnv): string => {
  const value = import.meta.env[name];
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

  const userPoolId = requireEnv('VITE_COGNITO_USER_POOL_ID');
  const userPoolClientId = requireEnv('VITE_COGNITO_WEB_CLIENT_ID');
  const domain = requireEnv('VITE_COGNITO_AUTH_DOMAIN');
  const isLocal =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  // Lax (not Strict): tokens must survive the top-level return from
  // auth.gagnechris.com → gagnechris.com/auth/callback.
  cognitoUserPoolsTokenProvider.setKeyValueStorage(
    new CookieStorage({
      domain: isLocal ? window.location.hostname : 'gagnechris.com',
      path: '/',
      expires: 30,
      sameSite: 'lax',
      secure: !isLocal,
    }),
  );

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
        loginWith: {
          oauth: {
            domain,
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [
              'https://gagnechris.com/auth/callback',
              'http://localhost:5173/auth/callback',
            ],
            redirectSignOut: [
              'https://gagnechris.com/',
              'http://localhost:5173/',
            ],
            responseType: 'code',
          },
        },
      },
    },
  });

  configured = true;
};
