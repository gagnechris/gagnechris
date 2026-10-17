import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ManagedUser } from '@gagnechris/shared';
import { answerConfirms, QueryClientTestProvider } from '../../test-utils';
import type { AuthUser } from '../../workspace/auth/session';
import AdminUsersPage from './AdminUsersPage';
import { adminApi } from '../../mockAdminApi';

const { GET: get, POST: post, PUT: put } = adminApi;

const session = vi.hoisted(() => ({
  authTime: 0 as number | null,
  redirectToSignIn: vi.fn(async (_options?: unknown) => undefined),
}));

vi.mock('../../workspace/auth/session', () => ({
  getAuthTime: async () => session.authTime,
  redirectToSignIn: (options?: unknown) => session.redirectToSignIn(options),
}));

vi.mock('../../workspace/api/client', () =>
  import('../../mockAdminApi').then((m) => m.mockAdminApi()),
);

const ok = (data: unknown) => ({
  data,
  error: undefined,
  response: { status: 200 },
});

const conflict = (error: string) => ({
  data: undefined,
  error: { error, message: error },
  response: { status: 409 },
});

const person = (over: Partial<ManagedUser>): ManagedUser => ({
  id: 'u',
  email: 'u@example.com',
  name: null,
  level: 'notebook',
  status: 'active',
  createdAt: '2026-10-01T12:00:00.000Z',
  ...over,
});

const chris = person({
  id: 'me',
  email: 'chris@example.com',
  name: 'Chris Gagne',
  level: 'full',
});
const sam = person({
  id: 'sam',
  email: 'sam@example.com',
  name: 'Sam Rivera',
  level: 'cms',
});
const jordan = person({
  id: 'jordan',
  email: 'jordan@example.com',
  name: 'Jordan Lee',
  status: 'invited',
});

const fullAdmin: AuthUser = {
  label: 'chris@example.com',
  userId: 'me',
  groups: ['site-admin', 'notebook', 'user-admin'],
};

function renderPage(user = fullAdmin) {
  render(
    <QueryClientTestProvider>
      <MemoryRouter initialEntries={['/settings/users']}>
        <Routes>
          <Route element={<Outlet context={{ user }} />}>
            <Route path="/settings/users" element={<AdminUsersPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientTestProvider>,
  );
}

const row = async (name: string) =>
  (await screen.findByText(name)).closest('tr')!;

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    session.authTime = Math.floor(Date.now() / 1000) - 60;
    get.mockResolvedValue(ok({ users: [chris, sam, jordan] }));
  });

  test('shows No access, and never calls the API, without user-admin', () => {
    renderPage({ ...fullAdmin, groups: ['site-admin'] });
    expect(
      screen.getByRole('heading', { name: 'No access' }),
    ).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  test('lists people with their level, apps, status and counts', async () => {
    renderPage();
    const me = await row('Chris Gagne');
    expect(within(me).getByText('(you)')).toBeInTheDocument();
    const samRow = await row('Sam Rivera');
    expect(within(samRow).getByText('Public CMS')).toBeInTheDocument();
    expect(within(samRow).getByText('Notebook')).toHaveClass('users-app--off');
    const jordanRow = await row('Jordan Lee');
    expect(within(jordanRow).getByText('Invited')).toBeInTheDocument();
    const levels = screen.getByRole('region', { name: 'Access levels' });
    expect(within(levels).getAllByText('1 user')).toHaveLength(3);
  });

  test('tapping a row opens Edit access, but Resend invite does not', async () => {
    renderPage();
    const jordanRow = await row('Jordan Lee');
    await userEvent.click(
      within(jordanRow).getByRole('button', { name: /Resend invite/ }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(
      within(await row('Sam Rivera')).getByText('Sam Rivera'),
    );
    expect(
      screen.getByRole('dialog', { name: 'Edit access for Sam Rivera' }),
    ).toBeInTheDocument();
  });

  test('changing access shows what changes, saves and toasts', async () => {
    put.mockResolvedValue(ok({ user: { ...sam, level: 'notebook' } }));
    renderPage();
    const trigger = within(await row('Sam Rivera')).getByRole('button', {
      name: 'Edit access for Sam Rivera',
    });
    await userEvent.click(trigger);
    const panel = screen.getByRole('dialog', {
      name: 'Edit access for Sam Rivera',
    });
    const save = within(panel).getByRole('button', { name: 'Save access' });
    expect(save).toBeDisabled();
    await userEvent.click(
      within(panel).getByRole('radio', { name: /Notebook only/ }),
    );
    expect(panel).toHaveTextContent('Public CMS → Notebook only');
    expect(panel).toHaveTextContent('Sam gains Notebook. Sam loses Admin.');
    await userEvent.click(save);
    expect(put).toHaveBeenCalledWith('/api/admin/users/{id}/access', {
      params: { path: { id: 'sam' } },
      body: { level: 'notebook' },
    });
    expect(
      await screen.findByText('Sam Rivera now has Notebook only access.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test('the panel starts on the current access, traps focus, closes on Esc and arrows move the radio', async () => {
    renderPage();
    const trigger = within(await row('Sam Rivera')).getByRole('button', {
      name: /Edit access/,
    });
    await userEvent.click(trigger);
    const panel = screen.getByRole('dialog');
    const cms = within(panel).getByRole('radio', { name: /Public CMS/ });
    expect(cms).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(panel).toContainElement(document.activeElement as HTMLElement);

    cms.focus();
    await userEvent.keyboard('{ArrowDown}');
    const notebook = within(panel).getByRole('radio', {
      name: /Notebook only/,
    });
    expect(notebook).toBeChecked();
    expect(notebook).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test('focus returns to the opener when a click does not focus it, as in Safari', async () => {
    renderPage();
    const edit = within(await row('Sam Rivera')).getByRole('button', {
      name: /Edit access/,
    });
    const invite = screen.getByRole('button', { name: 'Invite user' });
    for (const trigger of [edit, invite]) {
      fireEvent.click(trigger);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      trigger.blur();
    }
  });

  test('your own row keeps you a Full Admin with no account actions', async () => {
    renderPage();
    await userEvent.click(
      within(await row('Chris Gagne')).getByRole('button', { name: /Edit/ }),
    );
    const panel = screen.getByRole('dialog');
    expect(
      within(panel).getByRole('radio', { name: /Public CMS/ }),
    ).toBeDisabled();
    expect(panel).toHaveTextContent('You can’t lower your own access');
    expect(
      within(panel).queryByRole('button', { name: 'Remove' }),
    ).not.toBeInTheDocument();
  });

  test('shows the reason a change is refused', async () => {
    answerConfirms(true);
    post.mockResolvedValue(conflict('last_full_admin'));
    renderPage();
    await userEvent.click(
      within(await row('Sam Rivera')).getByRole('button', { name: /Edit/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There must always be at least one Full Admin.',
    );
  });

  test('Sign out, Disable and Remove ask first, and Cancel sends nothing', async () => {
    const confirmSpy = answerConfirms(false);
    renderPage();
    await userEvent.click(
      within(await row('Sam Rivera')).getByRole('button', { name: /Edit/ }),
    );
    for (const [button, message] of [
      ['Sign out', 'Sign out everywhere? Ends their sessions'],
      ['Disable', 'Disable sign-in? Keeps the account'],
      ['Remove', 'Remove access? Takes away every app'],
    ]) {
      await userEvent.click(screen.getByRole('button', { name: button }));
      expect(confirmSpy).toHaveBeenLastCalledWith(
        expect.stringContaining(message),
        button,
      );
    }
    expect(post).not.toHaveBeenCalled();
  });

  test('remove then restore', async () => {
    answerConfirms(true);
    const removedSam = { ...sam, status: 'removed' as const };
    post.mockResolvedValueOnce(ok({ user: removedSam }));
    renderPage();
    await userEvent.click(
      within(await row('Sam Rivera')).getByRole('button', { name: /Edit/ }),
    );
    get.mockResolvedValue(ok({ users: [chris, removedSam, jordan] }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(post).toHaveBeenLastCalledWith('/api/admin/users/{id}/remove', {
      params: { path: { id: 'sam' } },
    });
    expect(
      await screen.findByText(
        'Sam Rivera no longer has access. Their notes are kept.',
      ),
    ).toBeInTheDocument();

    post.mockResolvedValueOnce(ok({ user: sam }));
    get.mockResolvedValue(ok({ users: [chris, sam, jordan] }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Restore' }),
    );
    expect(post).toHaveBeenLastCalledWith('/api/admin/users/{id}/restore', {
      params: { path: { id: 'sam' } },
      body: { level: 'cms' },
    });
    expect(
      await screen.findByText('Sam Rivera has access again.'),
    ).toBeInTheDocument();
  });

  test('a removal that stopped part-way can be finished from the drawer', async () => {
    const halfRemoved = {
      ...sam,
      status: 'removed' as const,
      removalUnfinished: true,
    };
    const removedSam = { ...sam, status: 'removed' as const };
    get.mockResolvedValue(ok({ users: [chris, halfRemoved, jordan] }));
    renderPage();
    const samRow = await row('Sam Rivera');
    expect(within(samRow).getByText('Removal unfinished')).toBeInTheDocument();
    await userEvent.click(within(samRow).getByRole('button', { name: /Edit/ }));
    expect(
      screen.getByText('Removing them didn’t finish').closest('[role=status]'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled();
    post.mockResolvedValueOnce(ok({ user: removedSam }));
    get.mockResolvedValue(ok({ users: [chris, removedSam, jordan] }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Finish removing' }),
    );
    expect(post).toHaveBeenLastCalledWith('/api/admin/users/{id}/remove', {
      params: { path: { id: 'sam' } },
    });
    expect(
      await screen.findByText(
        'Sam Rivera no longer has access. Their notes are kept.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Removed · notes kept')).toBeInTheDocument();
  });

  test('invites with Notebook only by default and lists them as Invited', async () => {
    const alex = person({
      id: 'alex',
      email: 'alex@example.com',
      name: 'Alex Kim',
      status: 'invited',
    });
    post.mockResolvedValue(ok({ user: alex, restored: false }));
    renderPage();
    await screen.findByText('Sam Rivera');
    const trigger = screen.getByRole('button', { name: 'Invite user' });
    await userEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Invite user' });
    expect(
      within(dialog).getByRole('radio', { name: /Notebook only/ }),
    ).toBeChecked();
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Alex Kim');
    await userEvent.type(
      within(dialog).getByLabelText('Email'),
      'alex@example.com',
    );
    get.mockResolvedValue(ok({ users: [chris, sam, jordan, alex] }));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Send invite' }),
    );
    expect(post).toHaveBeenCalledWith('/api/admin/users', {
      body: { email: 'alex@example.com', name: 'Alex Kim', level: 'notebook' },
    });
    expect(
      await screen.findByText('Invite sent to alex@example.com.'),
    ).toBeInTheDocument();
    expect(
      within(await row('Alex Kim')).getByText('Invited'),
    ).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test('resends an invite from the list', async () => {
    post.mockResolvedValue(ok({ user: jordan }));
    renderPage();
    await userEvent.click(
      within(await row('Jordan Lee')).getByRole('button', {
        name: 'Resend invite to Jordan Lee',
      }),
    );
    expect(post).toHaveBeenCalledWith('/api/admin/users/{id}/resend-invite', {
      params: { path: { id: 'jordan' } },
    });
    expect(
      await screen.findByText('Invite sent again to jordan@example.com.'),
    ).toBeInTheDocument();
  });

  describe('confirming with a passkey', () => {
    const PENDING = 'gagnechris.pendingUserChange';

    test('a change without a recent sign-in asks for one first and sends nothing', async () => {
      answerConfirms(true);
      session.authTime = Math.floor(Date.now() / 1000) - 600;
      renderPage();
      await userEvent.click(
        within(await row('Sam Rivera')).getByRole('button', { name: /Edit/ }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Disable' }));
      expect(session.redirectToSignIn).toHaveBeenCalledWith({
        prompt: 'LOGIN',
      });
      expect(post).not.toHaveBeenCalled();
      expect(JSON.parse(window.sessionStorage.getItem(PENDING)!)).toMatchObject(
        {
          change: { id: 'sam', name: 'Sam Rivera', kind: 'disable' },
          userId: 'me',
        },
      );
      expect(screen.getByRole('dialog')).toHaveTextContent(
        'Confirm it’s you with your passkey',
      );
    });

    test('an invite without a recent sign-in asks for one first and sends nothing', async () => {
      session.authTime = Math.floor(Date.now() / 1000) - 600;
      renderPage();
      await screen.findByText('Sam Rivera');
      await userEvent.click(
        screen.getByRole('button', { name: 'Invite user' }),
      );
      const dialog = screen.getByRole('dialog', { name: 'Invite user' });
      await userEvent.type(
        within(dialog).getByLabelText('Email'),
        'alex@example.com',
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Send invite' }),
      );
      expect(session.redirectToSignIn).toHaveBeenCalledWith({
        prompt: 'LOGIN',
      });
      expect(post).not.toHaveBeenCalled();
      expect(
        JSON.parse(window.sessionStorage.getItem(PENDING)!).change,
      ).toEqual({
        kind: 'invite',
        email: 'alex@example.com',
        level: 'notebook',
      });
      expect(dialog).toHaveTextContent('Confirm it’s you with your passkey');
    });

    test('coming back signed in sends the invite once', async () => {
      window.sessionStorage.setItem(
        PENDING,
        JSON.stringify({
          change: {
            kind: 'invite',
            email: 'alex@example.com',
            name: 'Alex Kim',
            level: 'cms',
          },
          userId: 'me',
          at: Date.now() - 30_000,
        }),
      );
      session.authTime = Math.floor(Date.now() / 1000);
      post.mockResolvedValue(
        ok({
          user: person({ id: 'alex', email: 'alex@example.com', level: 'cms' }),
          restored: false,
        }),
      );
      renderPage();
      expect(
        await screen.findByText('Invite sent to alex@example.com.'),
      ).toBeInTheDocument();
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith('/api/admin/users', {
        body: { email: 'alex@example.com', name: 'Alex Kim', level: 'cms' },
      });
    });

    test('the server asking for a fresh sign-in also prompts', async () => {
      answerConfirms(true);
      post.mockResolvedValue({
        data: undefined,
        error: { error: 'reauth_required', message: 'x' },
        response: { status: 403 },
      });
      renderPage();
      await userEvent.click(
        within(await row('Sam Rivera')).getByRole('button', { name: /Edit/ }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      await waitFor(() =>
        expect(session.redirectToSignIn).toHaveBeenCalledWith({
          prompt: 'LOGIN',
        }),
      );
    });

    test('coming back signed in applies the change once', async () => {
      const at = Date.now() - 30_000;
      window.sessionStorage.setItem(
        PENDING,
        JSON.stringify({
          change: {
            id: 'sam',
            name: 'Sam Rivera',
            kind: 'access',
            level: 'notebook',
          },
          userId: 'me',
          at,
        }),
      );
      session.authTime = Math.floor(Date.now() / 1000);
      put.mockResolvedValue(ok({ user: { ...sam, level: 'notebook' } }));
      renderPage();
      expect(
        await screen.findByText('Sam Rivera now has Notebook only access.'),
      ).toBeInTheDocument();
      expect(put).toHaveBeenCalledTimes(1);
      expect(window.sessionStorage.getItem(PENDING)).toBeNull();
    });

    test('a change another user asked for is dropped when someone else signs in', async () => {
      window.sessionStorage.setItem(
        PENDING,
        JSON.stringify({
          change: { id: 'sam', name: 'Sam Rivera', kind: 'remove' },
          userId: 'someone-else',
          at: Date.now() - 30_000,
        }),
      );
      session.authTime = Math.floor(Date.now() / 1000);
      renderPage();
      await row('Sam Rivera');
      expect(post).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(PENDING)).toBeNull();
    });

    test('backing out of the prompt changes nothing', async () => {
      window.sessionStorage.setItem(
        PENDING,
        JSON.stringify({
          change: { id: 'sam', name: 'Sam Rivera', kind: 'remove' },
          userId: 'me',
          at: Date.now() - 30_000,
        }),
      );
      session.authTime = Math.floor(Date.now() / 1000) - 120;
      renderPage();
      await row('Sam Rivera');
      expect(post).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(PENDING)).toBeNull();
    });
  });
});
