import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import AuthCallback from './AuthCallback';
import { RETURN_TO_KEY } from './session';

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(async () => ({ tokens: { idToken: 'id-token' } })),
  getCurrentUser: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('aws-amplify/utils', () => ({
  Hub: { listen: () => () => undefined },
}));
vi.mock('./config', () => ({ ensureAmplifyConfigured: vi.fn() }));

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
});
