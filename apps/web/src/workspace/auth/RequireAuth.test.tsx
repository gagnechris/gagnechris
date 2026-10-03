import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import RequireAuth from './RequireAuth';

const getAuthUser = vi.fn();
const redirectToSignIn = vi.fn();

vi.mock('./session', () => ({
  getAuthUser: () => getAuthUser(),
  redirectToSignIn: () => redirectToSignIn(),
}));

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('redirects to Cognito when signed out', async () => {
    getAuthUser.mockResolvedValue(null);
    redirectToSignIn.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <RequireAuth>{() => <div>secret</div>}</RequireAuth>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(redirectToSignIn).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  test('renders children when signed in', async () => {
    getAuthUser.mockResolvedValue({ label: 'admin@example.com', userId: 'u1' });

    render(
      <MemoryRouter>
        <RequireAuth>{(user) => <div>hello {user.label}</div>}</RequireAuth>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('hello admin@example.com'),
    ).toBeInTheDocument();
    expect(redirectToSignIn).not.toHaveBeenCalled();
  });
});
