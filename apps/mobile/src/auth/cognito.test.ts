import { describe, expect, it, vi } from 'vitest';
import {
  IOS_AUTH_REDIRECTS,
  resolveAuthMode,
  type CognitoConfig,
} from '../config';
import { SessionExpiredError } from './backend';
import { decodeIdToken, userFromClaims } from './claims';

const auth = vi.hoisted(() => {
  class TokenError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  const prompts: unknown[] = [];
  const requests: unknown[] = [];
  return {
    TokenError,
    prompts,
    requests,
    exchangeCodeAsync: vi.fn(async () => ({
      idToken: 'id',
      refreshToken: 'rt',
    })),
    refreshAsync: vi.fn(),
    revokeAsync: vi.fn(async () => true),
    openAuthSessionAsync: vi.fn(async () => ({ type: 'success' })),
  };
});

vi.mock('expo-auth-session', () => ({
  AuthRequest: class {
    codeVerifier = 'verifier';
    constructor(config: unknown) {
      auth.requests.push(config);
    }
    async promptAsync(_discovery: unknown, options: unknown) {
      auth.prompts.push(options);
      return { type: 'success', params: { code: 'the-code' } };
    }
  },
  CodeChallengeMethod: { S256: 'S256' },
  ResponseType: { Code: 'code' },
  TokenTypeHint: { RefreshToken: 'refresh_token' },
  TokenError: auth.TokenError,
  exchangeCodeAsync: auth.exchangeCodeAsync,
  refreshAsync: auth.refreshAsync,
  revokeAsync: auth.revokeAsync,
}));
vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: auth.openAuthSessionAsync,
}));

const { cognitoIssuer, cognitoLogoutUrl } = await import('./cognito');

const config: CognitoConfig = {
  domain: 'auth.gagnechris.com',
  clientId: 'ios-client',
  ...IOS_AUTH_REDIRECTS.scheme,
  ephemeralSession: true,
};

const base64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const jwt = (claims: object) => `h.${base64Url(JSON.stringify(claims))}.s`;

describe('Cognito sign-in', () => {
  it('runs the code flow with PKCE in an ephemeral session on the custom scheme', async () => {
    const tokens = await cognitoIssuer(config).signIn({ newAccount: false });
    expect(tokens).toEqual({ idToken: 'id', refreshToken: 'rt' });
    expect(auth.requests.at(-1)).toMatchObject({
      clientId: 'ios-client',
      redirectUri: 'gagnechris://auth/callback',
      responseType: 'code',
      usePKCE: true,
      codeChallengeMethod: 'S256',
      scopes: ['openid', 'email', 'profile'],
    });
    expect(auth.prompts.at(-1)).toEqual({
      preferEphemeralSession: true,
      preferUniversalLinks: false,
    });
    expect(auth.exchangeCodeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'the-code',
        extraParams: { code_verifier: 'verifier' },
      }),
      expect.objectContaining({
        tokenEndpoint: 'https://auth.gagnechris.com/oauth2/token',
      }),
    );
  });

  it('switches to the universal-link callback with one config change', async () => {
    await cognitoIssuer({
      ...config,
      ...IOS_AUTH_REDIRECTS.universalLink,
    }).signIn({
      newAccount: false,
    });
    expect(auth.requests.at(-1)).toMatchObject({
      redirectUri: 'https://notebook.gagnechris.com/ios/auth/callback',
    });
    expect(auth.prompts.at(-1)).toMatchObject({ preferUniversalLinks: true });
  });

  it('asks for a login again when the session is shared and another account is wanted', async () => {
    await cognitoIssuer({ ...config, ephemeralSession: false }).signIn({
      newAccount: true,
    });
    expect(auth.requests.at(-1)).toMatchObject({
      extraParams: { prompt: 'login' },
    });
  });

  it('ends a shared session with /logout, and an ephemeral one with nothing', async () => {
    await cognitoIssuer(config).endSession();
    expect(auth.openAuthSessionAsync).not.toHaveBeenCalled();
    await cognitoIssuer({ ...config, ephemeralSession: false }).endSession();
    expect(auth.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://auth.gagnechris.com/logout?client_id=ios-client&logout_uri=gagnechris%3A%2F%2F',
      'gagnechris://',
      { preferUniversalLinks: false },
    );
    expect(
      cognitoLogoutUrl({ ...config, ...IOS_AUTH_REDIRECTS.universalLink }),
    ).toContain(
      'logout_uri=https%3A%2F%2Fnotebook.gagnechris.com%2Fios%2Fauth%2Fsigned-out',
    );
  });

  it('turns invalid_grant into an ended session and keeps the old refresh token without rotation', async () => {
    const issuer = cognitoIssuer(config);
    auth.refreshAsync.mockRejectedValueOnce(
      new auth.TokenError('invalid_grant'),
    );
    await expect(issuer.refresh('rt')).rejects.toBeInstanceOf(
      SessionExpiredError,
    );

    auth.refreshAsync.mockRejectedValueOnce(
      new TypeError('Network request failed'),
    );
    await expect(issuer.refresh('rt')).rejects.toBeInstanceOf(TypeError);

    auth.refreshAsync.mockResolvedValueOnce({
      idToken: 'id2',
      refreshToken: 'rt2',
    });
    expect(await issuer.refresh('rt')).toEqual({
      idToken: 'id2',
      refreshToken: 'rt2',
    });
    auth.refreshAsync.mockResolvedValueOnce({ idToken: 'id3' });
    expect(await issuer.refresh('rt2')).toEqual({
      idToken: 'id3',
      refreshToken: 'rt2',
    });
  });

  it('revokes the refresh token', async () => {
    await cognitoIssuer(config).revoke('rt');
    expect(auth.revokeAsync).toHaveBeenCalledWith(
      { clientId: 'ios-client', token: 'rt', tokenTypeHint: 'refresh_token' },
      expect.objectContaining({
        revocationEndpoint: 'https://auth.gagnechris.com/oauth2/revoke',
      }),
    );
  });

  it('refuses to start without a client id', () => {
    expect(() => cognitoIssuer({ ...config, clientId: '' })).toThrow(
      /EXPO_PUBLIC_COGNITO_IOS_CLIENT_ID/,
    );
  });

  it('reads the user and groups from the ID token', () => {
    const token = jwt({
      sub: 'abc',
      exp: 2_000_000_000,
      email: 'chris@example.com',
      name: 'Chris Gagné',
      'cognito:groups': ['site-admin'],
    });
    const issuer = cognitoIssuer(config);
    expect(issuer.user(token)).toEqual({
      sub: 'abc',
      email: 'chris@example.com',
      name: 'Chris Gagné',
      groups: ['site-admin'],
    });
    expect(issuer.expiresAt(token)).toBe(2_000_000_000_000);
    expect(decodeIdToken('not-a-jwt')).toBeNull();
    expect(userFromClaims({ sub: 'x', exp: 1 }).groups).toEqual([]);
  });
});

describe('auth mode', () => {
  it('follows the API when unset and never allows local auth outside dev builds', () => {
    expect(resolveAuthMode(undefined, 'http://127.0.0.1:8787', true)).toBe(
      'local',
    );
    expect(resolveAuthMode(undefined, 'https://gagnechris.com', true)).toBe(
      'cognito',
    );
    expect(resolveAuthMode('cognito', 'http://127.0.0.1:8787', true)).toBe(
      'cognito',
    );
    expect(resolveAuthMode('local', 'http://127.0.0.1:8787', false)).toBe(
      'cognito',
    );
    expect(resolveAuthMode(undefined, 'http://localhost:8787', false)).toBe(
      'cognito',
    );
  });
});
