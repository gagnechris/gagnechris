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
  renewManagedLoginUrl: () =>
    'https://auth.example.com/oauth2/authorize?client_id=c&prompt=login',
  ensureAmplifyConfigured: vi.fn(),
}));

import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import {
  canAddPasskey,
  passkeyCallbackStep,
  getAuthTime,
  getAuthUser,
  openAddPasskey,
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

  test('opens the add-passkey page and comes back to the same page', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    try {
      window.history.replaceState(null, '', '/notes/01J9ZX');
      Object.assign(window.location, { pathname: '/notes/01J9ZX' });
      expect(canAddPasskey()).toBe(true);
      openAddPasskey();
      expect(assign).toHaveBeenCalledWith(
        'https://auth.example.com/passkeys/add?client_id=c',
      );
      expect(takeReturnTo()).toBe('/notes/01J9ZX');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('signs in once when the passkey page finds no session, then reopens it', () => {
    expect(passkeyCallbackStep('?result=invalid_session')).toEqual({
      redirect:
        'https://auth.example.com/oauth2/authorize?client_id=c&prompt=login',
    });
    // A repeated render of the same callback doesn't spend the retry.
    expect(passkeyCallbackStep('?result=invalid_session')).toEqual({
      redirect:
        'https://auth.example.com/oauth2/authorize?client_id=c&prompt=login',
    });
    expect(passkeyCallbackStep('?code=abc&state=s')).toEqual({
      redirect: 'https://auth.example.com/passkeys/add?client_id=c',
    });
    // Back from the passkey page: the round trip is done, so a later sign-in
    // is an ordinary one.
    expect(passkeyCallbackStep('?result=success')).toBeNull();
    expect(passkeyCallbackStep('?code=def&state=s')).toBeNull();
  });

  test('stops with a message when signing in still leaves no session', () => {
    passkeyCallbackStep('?result=invalid_session');
    passkeyCallbackStep('?code=abc&state=s');
    expect(passkeyCallbackStep('?result=invalid_session&n=2')).toEqual({
      error: expect.stringContaining('Try again'),
    });
  });

  test('stops when the sign-in returns without a code', () => {
    passkeyCallbackStep('?result=invalid_session&a');
    expect(passkeyCallbackStep('?result=invalid_session&b')).toEqual({
      error: expect.stringContaining('Try again'),
    });
  });

  test('leaves an ordinary sign-in callback alone', () => {
    expect(passkeyCallbackStep('?code=ordinary&state=s')).toBeNull();
    expect(passkeyCallbackStep('?result=success')).toBeNull();
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
