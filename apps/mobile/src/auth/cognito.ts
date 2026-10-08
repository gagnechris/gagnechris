import {
  AuthRequest,
  CodeChallengeMethod,
  exchangeCodeAsync,
  refreshAsync,
  ResponseType,
  revokeAsync,
  TokenError,
  TokenTypeHint,
  type DiscoveryDocument,
} from 'expo-auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';
import type { CognitoConfig } from '../config';
import { SessionExpiredError, type TokenIssuer } from './backend';
import { decodeIdToken, userFromClaims } from './claims';

export function cognitoDiscovery(domain: string): DiscoveryDocument {
  const base = `https://${domain}`;
  return {
    authorizationEndpoint: `${base}/oauth2/authorize`,
    tokenEndpoint: `${base}/oauth2/token`,
    revocationEndpoint: `${base}/oauth2/revoke`,
    endSessionEndpoint: `${base}/logout`,
  };
}

export function cognitoLogoutUrl(config: CognitoConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  });
  return `${cognitoDiscovery(config.domain).endSessionEndpoint}?${params}`;
}

/** Managed login (passkeys on `auth.gagnechris.com`) in `ASWebAuthenticationSession`, code + PKCE. */
export function cognitoIssuer(config: CognitoConfig): TokenIssuer {
  if (!config.clientId) {
    throw new Error(
      'Set EXPO_PUBLIC_COGNITO_IOS_CLIENT_ID (SSM /gagnechris/prod/cognito-ios-client-id)',
    );
  }
  const discovery = cognitoDiscovery(config.domain);
  const { clientId, redirectUri } = config;

  return {
    async signIn({ newAccount }) {
      const request = new AuthRequest({
        clientId,
        redirectUri,
        responseType: ResponseType.Code,
        scopes: ['openid', 'email', 'profile'],
        usePKCE: true,
        codeChallengeMethod: CodeChallengeMethod.S256,
        // A shared session would sign the last account straight back in.
        extraParams:
          newAccount && !config.ephemeralSession ? { prompt: 'login' } : {},
      });
      const result = await request.promptAsync(discovery, {
        preferEphemeralSession: config.ephemeralSession,
        preferUniversalLinks: config.preferUniversalLinks,
      });
      if (result.type !== 'success') {
        if (result.type === 'error') {
          throw result.error ?? new Error('Sign-in failed');
        }
        return null;
      }
      const response = await exchangeCodeAsync(
        {
          clientId,
          redirectUri,
          code: result.params.code!,
          extraParams: { code_verifier: request.codeVerifier! },
        },
        discovery,
      );
      if (!response.idToken || !response.refreshToken) {
        throw new Error('Sign-in returned no ID or refresh token');
      }
      return { idToken: response.idToken, refreshToken: response.refreshToken };
    },

    async refresh(refreshToken) {
      try {
        const response = await refreshAsync(
          { clientId, refreshToken },
          discovery,
        );
        if (!response.idToken) throw new Error('Refresh returned no ID token');
        return {
          idToken: response.idToken,
          // Rotation returns a new refresh token; without it the old one stays valid.
          refreshToken: response.refreshToken ?? refreshToken,
        };
      } catch (error) {
        if (error instanceof TokenError && error.code === 'invalid_grant') {
          throw new SessionExpiredError();
        }
        throw error;
      }
    },

    async revoke(refreshToken) {
      await revokeAsync(
        {
          clientId,
          token: refreshToken,
          tokenTypeHint: TokenTypeHint.RefreshToken,
        },
        discovery,
      );
    },

    async endSession() {
      if (config.ephemeralSession) return;
      await openAuthSessionAsync(cognitoLogoutUrl(config), config.logoutUri, {
        preferUniversalLinks: config.preferUniversalLinks,
      });
    },

    user(idToken) {
      const claims = decodeIdToken(idToken);
      return claims ? userFromClaims(claims) : null;
    },

    expiresAt(idToken) {
      return (decodeIdToken(idToken)?.exp ?? 0) * 1000;
    },
  };
}
