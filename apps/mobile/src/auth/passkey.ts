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
 * The sheet shares sign-in's session, so managed login adds the passkey to the
 * signed-in user without asking them to sign in again.
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
