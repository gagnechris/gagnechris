import { openAuthSessionAsync } from 'expo-web-browser';
import { authMode, cognitoConfig, type CognitoConfig } from '../config';

export const canAddPasskey = authMode === 'cognito';

/** Managed login's page for a signed-in user to register a passkey. */
export function addPasskeyUrl(config: CognitoConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
  });
  return `https://${config.domain}/passkeys/add?${params}`;
}

/**
 * The sheet is ephemeral like sign-in, so managed login asks the user to sign
 * in before adding the passkey.
 */
export async function addPasskey(): Promise<void> {
  await openAuthSessionAsync(
    addPasskeyUrl(cognitoConfig),
    cognitoConfig.redirectUri,
    {
      preferEphemeralSession: cognitoConfig.ephemeralSession,
      preferUniversalLinks: cognitoConfig.preferUniversalLinks,
    },
  );
}
