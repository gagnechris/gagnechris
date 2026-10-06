import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { signOut, signInWithRedirect } = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
  signInWithRedirect: vi.fn(async () => undefined),
}));

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
  getCurrentUser: vi.fn(),
  signInWithRedirect,
  signOut,
}));
vi.mock('./config', () => ({ ensureAmplifyConfigured: vi.fn() }));

import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import {
  getAuthTime,
  getAuthUser,
  RETURN_TO_KEY,
  redirectToSignIn,
  safeReturnTo,
  signOutUser,
  takeReturnTo,
} from './session';

describe('Cognito session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_AUTH_MODE', '');
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  test('reads the Cognito groups from the ID token', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: 'u1',
      username: 'u1',
    });
    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: {
        accessToken: { toString: () => 'access', payload: {} },
        idToken: {
          toString: () => 'id',
          payload: {
            email: 'cms@example.com',
            'cognito:groups': ['site-admin'],
          },
        },
      },
    });
    expect(await getAuthUser()).toEqual({
      label: 'cms@example.com',
      userId: 'u1',
      groups: ['site-admin'],
    });
  });

  test('counts a session whose tokens could not be refreshed as signed out', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      userId: 'u1',
      username: 'u1',
    });
    vi.mocked(fetchAuthSession).mockResolvedValue({});
    expect(await getAuthUser()).toBeNull();
  });

  test('asks managed login to sign in again, and reads when that happened', async () => {
    await redirectToSignIn({ prompt: 'LOGIN' });
    expect(signInWithRedirect).toHaveBeenCalledWith({
      options: { prompt: 'LOGIN' },
    });
    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: {
        accessToken: { toString: () => 'access', payload: {} },
        idToken: { toString: () => 'id', payload: { auth_time: 1700000000 } },
      },
    });
    expect(await getAuthTime()).toBe(1700000000);
  });

  test("signs out of this app only, so the other app's session survives", async () => {
    await signOutUser();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith();
  });

  test('remembers the deep link before leaving for managed login', async () => {
    window.history.replaceState(null, '', '/notes/01J9ZX?area=work#top');
    await redirectToSignIn();
    expect(signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBe(
      '/notes/01J9ZX?area=work#top',
    );
    expect(takeReturnTo()).toBe('/notes/01J9ZX?area=work#top');
    expect(takeReturnTo()).toBe('/');
  });

  test.each([
    [null, '/'],
    ['', '/'],
    ['https://evil.example/x', '/'],
    ['//evil.example/x', '/'],
    ['/\\evil.example', '/'],
    ['/auth/callback?code=x', '/'],
    ['/auth', '/'],
    ['/today', '/today'],
    ['/posts/01J9ZX', '/posts/01J9ZX'],
    ['/authors', '/authors'],
  ])('safeReturnTo(%s) is %s', (value, expected) => {
    expect(safeReturnTo(value)).toBe(expected);
  });
});
