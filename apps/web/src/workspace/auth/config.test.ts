import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { configure, setKeyValueStorage, cookieStorage } = vi.hoisted(() => ({
  configure: vi.fn(),
  setKeyValueStorage: vi.fn(),
  cookieStorage: vi.fn(),
}));

vi.mock('aws-amplify', () => ({ Amplify: { configure } }));
vi.mock('aws-amplify/auth/enable-oauth-listener', () => ({}));
vi.mock('aws-amplify/auth/cognito', () => ({
  cognitoUserPoolsTokenProvider: { setKeyValueStorage },
}));
vi.mock('aws-amplify/utils', () => ({ CookieStorage: cookieStorage }));

const loadConfig = async () => {
  vi.resetModules();
  return import('./config');
};

describe('ensureAmplifyConfigured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_pool');
    vi.stubEnv('VITE_COGNITO_AUTH_DOMAIN', 'auth.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("uses this app's client and its own origin for both redirects", async () => {
    const { ensureAmplifyConfigured, setAuthClientId } = await loadConfig();
    setAuthClientId('notebook-client');
    ensureAmplifyConfigured();

    expect(configure).toHaveBeenCalledTimes(1);
    const cognito = configure.mock.calls[0]![0].Auth.Cognito;
    expect(cognito.userPoolClientId).toBe('notebook-client');
    expect(cognito.loginWith.oauth.redirectSignIn).toEqual([
      `${window.location.origin}/auth/callback`,
    ]);
    expect(cognito.loginWith.oauth.redirectSignOut).toEqual([
      `${window.location.origin}/`,
    ]);
  });

  test("keeps Amplify's default per-origin localStorage token store", async () => {
    const { ensureAmplifyConfigured, setAuthClientId } = await loadConfig();
    setAuthClientId('admin-client');
    ensureAmplifyConfigured();

    expect(setKeyValueStorage).not.toHaveBeenCalled();
    expect(cookieStorage).not.toHaveBeenCalled();
  });

  test('refuses to configure without a client ID', async () => {
    const { ensureAmplifyConfigured } = await loadConfig();
    expect(() => ensureAmplifyConfigured()).toThrow(/client ID is not set/);
    expect(configure).not.toHaveBeenCalled();
  });
});
