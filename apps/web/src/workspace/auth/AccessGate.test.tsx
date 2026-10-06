import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import AccessGate from './AccessGate';
import { reportAccessDenied } from './accessWatch';
import type { AuthUser } from './session';

const getAuthUser = vi.fn();
const redirectToSignIn = vi.fn();
const signOutUser = vi.fn();
const getIdToken = vi.fn<(options?: unknown) => Promise<string>>(
  async () => 'token',
);

vi.mock('./session', () => ({
  getAuthUser: () => getAuthUser(),
  redirectToSignIn: () => redirectToSignIn(),
  signOutUser: () => signOutUser(),
  getIdToken: (options: unknown) => getIdToken(options),
}));

const user = (groups: string[]): AuthUser => ({
  label: 'sam@example.com',
  userId: 'sam',
  groups,
});

const app = <div>the app</div>;

describe('AccessGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('a Notebook-only user opening Admin sees No access, not the app', async () => {
    getAuthUser.mockResolvedValue(user(['notebook']));
    render(
      <AccessGate app="admin" user={user(['notebook'])}>
        {() => app}
      </AccessGate>,
    );
    expect(
      await screen.findByRole('heading', {
        name: 'You don’t have access to Admin',
      }),
    ).toBeInTheDocument();
    expect(getIdToken).toHaveBeenCalledWith({ forceRefresh: true });
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
    expect(screen.getByText('Notebook only')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to Notebook' }),
    ).toHaveAttribute('href', 'http://localhost:5175/');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOutUser).toHaveBeenCalledTimes(1);
  });

  test('a Public CMS user opening Notebook is offered Admin', async () => {
    getAuthUser.mockResolvedValue(user(['site-admin']));
    render(
      <AccessGate app="notebook" user={user(['site-admin'])}>
        {() => app}
      </AccessGate>,
    );
    expect(
      await screen.findByRole('heading', {
        name: 'You don’t have access to Notebook',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Public CMS')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to Admin' }),
    ).toBeInTheDocument();
  });

  test('hides Go to when they have neither app', async () => {
    getAuthUser.mockResolvedValue(user([]));
    render(
      <AccessGate app="admin" user={user([])}>
        {() => app}
      </AccessGate>,
    );
    await screen.findByRole('heading', { name: /don’t have access/ });
    expect(
      screen.queryByRole('link', { name: /Go to/ }),
    ).not.toBeInTheDocument();
  });

  test('a refused request after access was lowered shows No access', async () => {
    getAuthUser.mockResolvedValue(user(['notebook']));
    render(
      <AccessGate app="admin" user={user(['site-admin'])}>
        {() => app}
      </AccessGate>,
    );
    expect(screen.getByText('the app')).toBeInTheDocument();
    act(() => reportAccessDenied());
    expect(
      await screen.findByRole('heading', {
        name: /don’t have access to Admin/,
      }),
    ).toBeInTheDocument();
  });

  test('a token from before joining the group is refreshed into the app', async () => {
    getAuthUser.mockResolvedValue(user(['site-admin']));
    render(
      <AccessGate app="admin" user={user([])}>
        {() => app}
      </AccessGate>,
    );
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  test('keeps the app when the group is still there', async () => {
    getAuthUser.mockResolvedValue(user(['site-admin']));
    render(
      <AccessGate app="admin" user={user(['site-admin'])}>
        {() => app}
      </AccessGate>,
    );
    act(() => reportAccessDenied());
    await waitFor(() => expect(getAuthUser).toHaveBeenCalledTimes(1));
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  test('an ended session goes back to sign-in', async () => {
    getAuthUser.mockResolvedValue(null);
    render(
      <AccessGate app="admin" user={user(['site-admin'])}>
        {() => app}
      </AccessGate>,
    );
    act(() => reportAccessDenied());
    await waitFor(() => expect(redirectToSignIn).toHaveBeenCalledTimes(1));
  });
});
