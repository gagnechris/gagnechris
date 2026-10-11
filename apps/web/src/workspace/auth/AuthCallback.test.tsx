import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import AuthCallback from './AuthCallback';
import { ADD_PASSKEY_AFTER_SIGN_IN_KEY, RETURN_TO_KEY } from './session';

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(async () => ({ tokens: { idToken: 'id-token' } })),
  getCurrentUser: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: () => () => undefined },
}));
vi.mock('./config', () => ({
  addPasskeyUrl: () => 'https://auth.example.com/passkeys/add?client_id=c',
  ensureAmplifyConfigured: vi.fn(),
}));

const renderCallback = () =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/auth/callback', element: <AuthCallback /> },
          { path: '/', element: <p>App home</p> },
          { path: '/notes/:id', element: <p>Deep-linked note</p> },
        ],
        { initialEntries: ['/auth/callback?code=x&state=y'] },
      )}
    />,
  );

describe('AuthCallback', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/auth/callback?code=x&state=y');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("lands on the app's home after sign-in", async () => {
    renderCallback();
    expect(await screen.findByText('App home')).toBeInTheDocument();
  });

  test('returns to the deep link that started sign-in', async () => {
    window.sessionStorage.setItem(RETURN_TO_KEY, '/notes/01J9ZX');
    renderCallback();
    expect(await screen.findByText('Deep-linked note')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBeNull();
  });

  test('continues to the passkey page when that sign-in was for adding one', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    window.sessionStorage.setItem(
      ADD_PASSKEY_AFTER_SIGN_IN_KEY,
      String(Date.now()),
    );
    window.sessionStorage.setItem(RETURN_TO_KEY, '/notes/01J9ZX');
    renderCallback();
    await vi.waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://auth.example.com/passkeys/add?client_id=c',
      ),
    );
    expect(window.sessionStorage.getItem(RETURN_TO_KEY)).toBe('/notes/01J9ZX');
  });

  test('shows the error managed login sends back', async () => {
    window.history.replaceState(
      null,
      '',
      '/auth/callback?error=access_denied&error_description=Passkey+registration+was+cancelled',
    );
    renderCallback();
    expect(
      await screen.findByText('Passkey registration was cancelled'),
    ).toBeInTheDocument();
  });
});
