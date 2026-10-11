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
vi.mock('./config', () => ({
  addPasskeyUrl: () => 'https://auth.example.com/passkeys/add?client_id=c',
  ensureAmplifyConfigured: vi.fn(),
}));

import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import {
  ADD_PASSKEY_AFTER_SIGN_IN_KEY,
  canAddPasskey,
  getAuthTime,
  getAuthUser,
  openAddPasskey,
  RETURN_TO_KEY,
  redirectToSignIn,
  safeReturnTo,
  signOutUser,
  takeAddPasskeyAfterSignIn,
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

  const signedInAt = (authTime: number) =>
    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: {
        accessToken: { toString: () => 'access', payload: {} },
        idToken: { toString: () => 'id', payload: { auth_time: authTime } },
      },
    });

  test('opens the add-passkey page after a recent sign-in and comes back to the same page', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    try {
      window.history.replaceState(null, '', '/notes/01J9ZX');
      Object.assign(window.location, { pathname: '/notes/01J9ZX' });
      signedInAt(Math.floor(Date.now() / 1000) - 10 * 60);
      expect(canAddPasskey()).toBe(true);
      await openAddPasskey();
      expect(assign).toHaveBeenCalledWith(
        'https://auth.example.com/passkeys/add?client_id=c',
      );
      expect(signInWithRedirect).not.toHaveBeenCalled();
      expect(takeReturnTo()).toBe('/notes/01J9ZX');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('signs in again first when managed login has forgotten the sign-in', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    try {
      window.history.replaceState(null, '', '/settings/users');
      Object.assign(window.location, { pathname: '/settings/users' });
      signedInAt(Math.floor(Date.now() / 1000) - 2 * 60 * 60);
      await openAddPasskey();
      expect(assign).not.toHaveBeenCalled();
      expect(signInWithRedirect).toHaveBeenCalledWith({
        options: { prompt: 'LOGIN' },
      });
      expect(takeAddPasskeyAfterSignIn()).toBe(
        'https://auth.example.com/passkeys/add?client_id=c',
      );
      expect(takeAddPasskeyAfterSignIn()).toBeNull();
      expect(takeReturnTo()).toBe('/settings/users');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('forgets a passkey request whose sign-in never came back', () => {
    const now = Date.now();
    window.sessionStorage.setItem(
      ADD_PASSKEY_AFTER_SIGN_IN_KEY,
      String(now - 11 * 60 * 1000),
    );
    expect(takeAddPasskeyAfterSignIn(now)).toBeNull();
    expect(takeAddPasskeyAfterSignIn(now)).toBeNull();
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
