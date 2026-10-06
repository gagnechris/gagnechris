import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getAuthUser, getIdToken, LOCAL_AUTH_USER_KEY } from './session';

describe('local fake auth', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_AUTH_MODE', 'local');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  test('defaults to the local dev user', async () => {
    expect(await getAuthUser()).toEqual({
      label: 'local@gagnechris.com',
      userId: 'local-dev-user',
      groups: ['site-admin', 'notebook', 'user-admin'],
    });
    expect(await getIdToken()).toBe('local:local-dev-user');
  });

  test('signs in as the user stored in localStorage', async () => {
    window.localStorage.setItem(
      LOCAL_AUTH_USER_KEY,
      JSON.stringify({ label: 'second@example.com', userId: 'e2e-second' }),
    );
    expect(await getAuthUser()).toEqual({
      label: 'second@example.com',
      userId: 'e2e-second',
      groups: ['site-admin', 'notebook', 'user-admin'],
    });
    expect(await getIdToken()).toBe('local:e2e-second');
  });

  test("takes the stored user's groups when given", async () => {
    window.localStorage.setItem(
      LOCAL_AUTH_USER_KEY,
      JSON.stringify({
        label: 'cms@example.com',
        userId: 'e2e-cms',
        groups: ['site-admin'],
      }),
    );
    expect((await getAuthUser())?.groups).toEqual(['site-admin']);
  });

  test('ignores a malformed stored user', async () => {
    window.localStorage.setItem(LOCAL_AUTH_USER_KEY, '{not json');
    expect((await getAuthUser())?.userId).toBe('local-dev-user');
  });
});
