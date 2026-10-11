import { openAuthSessionAsync } from 'expo-web-browser';
import { Alert } from 'react-native';
import { authMode, cognitoConfig, type CognitoConfig } from '../config';

export const canAddPasskey = authMode === 'cognito';

const managedLoginUrl = (
  config: CognitoConfig,
  path: string,
  extra: Record<string, string> = {},
) =>
  `https://${config.domain}${path}?${new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    ...extra,
  })}`;

/** Managed login's page for a signed-in user to register a passkey. */
export const addPasskeyUrl = (config: CognitoConfig): string =>
  managedLoginUrl(config, '/passkeys/add');

/**
 * A sign-in that only renews the managed-login session `/passkeys/add` needs;
 * the code it returns is never redeemed, so the app keeps its tokens.
 */
export const renewManagedLoginUrl = (config: CognitoConfig): string =>
  managedLoginUrl(config, '/oauth2/authorize', {
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'login',
  });

type Open = typeof openAuthSessionAsync;

/**
 * The sheet shares sign-in's session. That managed-login session lasts far
 * less than the app's refresh token, and without it Cognito returns
 * `result=invalid_session`, so the user signs in once and the page reopens.
 */
export async function addPasskey(
  config: CognitoConfig = cognitoConfig,
  open: Open = openAuthSessionAsync,
): Promise<'done' | 'cancelled' | 'failed'> {
  const sheet = (url: string) =>
    open(url, config.redirectUri, {
      preferEphemeralSession: config.ephemeralSession,
      preferUniversalLinks: config.preferUniversalLinks,
    });
  const noSession = (result: Awaited<ReturnType<Open>>) =>
    result.type === 'success' &&
    new URL(result.url).searchParams.get('result') === 'invalid_session';

  let result = await sheet(addPasskeyUrl(config));
  if (!noSession(result))
    return result.type === 'success' ? 'done' : 'cancelled';
  const signIn = await sheet(renewManagedLoginUrl(config));
  if (signIn.type !== 'success') return 'cancelled';
  result = await sheet(addPasskeyUrl(config));
  if (noSession(result)) return 'failed';
  return result.type === 'success' ? 'done' : 'cancelled';
}

/** The More row: runs `addPasskey` and says so when it couldn't. */
export async function addPasskeyFromMore(): Promise<void> {
  if ((await addPasskey()) === 'failed') {
    Alert.alert(
      'Couldn’t add a passkey',
      'The passkey page still asked you to sign in. Try again.',
    );
  }
}
