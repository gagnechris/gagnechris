import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import { getAuthUser } from '../workspace/auth/session';
import AdminLayout from './AdminLayout';
import AdminPostsPage from './AdminPostsPage';
import AdminUsersPage from './settings/AdminUsersPage';

const { isDevProdApiTargetMock, pending } = vi.hoisted(() => ({
  isDevProdApiTargetMock: vi.fn(() => false),
  pending: { value: false, cleared: 0 },
}));

vi.mock('@gagnechris/app-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gagnechris/app-core')>()),
  hasPendingFlushes: () => pending.value,
  clearPendingFlushes: () => {
    pending.cleared += 1;
    pending.value = false;
  },
}));

vi.mock('../workspace/api/apiTarget', () => ({
  isDevProdApiTarget: () => isDevProdApiTargetMock(),
}));

vi.mock('../workspace/auth/session', () => ({
  getAuthUser: vi.fn(async () => ({
    label: 'admin@example.com',
    userId: 'u1',
    groups: ['site-admin'],
  })),
  redirectToSignIn: vi.fn(),
  canAddPasskey: () => false,
  signOutUser: vi.fn(),
  getIdToken: vi.fn(async () => 'fake-id-token'),
  getAuthTime: async () => null,
}));

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string) => ({
      data:
        path === '/api/admin/users'
          ? {
              users: [
                {
                  id: 'sam',
                  email: 'sam@example.com',
                  name: 'Sam Rivera',
                  level: 'cms',
                  status: 'active',
                  createdAt: null,
                },
              ],
            }
          : { items: [] },
      error: undefined,
      response: { status: 200 },
    }),
  }),
}));

const fullAdmin = {
  label: 'chris@example.com',
  userId: 'me',
  groups: ['site-admin', 'notebook', 'user-admin'],
};

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDevProdApiTargetMock.mockReturnValue(false);
    pending.value = false;
    pending.cleared = 0;
  });

  const renderPosts = () =>
    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<AdminPostsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

  test('warns on unload only while unmounted editors still have saves queued', async () => {
    renderPosts();
    await screen.findByRole('navigation', { name: 'Admin' });
    // The nav can be in the DOM a macrotask before React runs the effect
    // that adds the listener; act() flushes pending effects.
    await act(async () => {});

    const idle = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);

    pending.value = true;
    const queued = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(queued);
    expect(queued.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out of Admin' }));
    expect(pending.cleared).toBe(1);
  });

  test('shows the Public site nav and posts hub when authenticated', async () => {
    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<AdminPostsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    const nav = await screen.findByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: 'Posts' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Posts', 'Pages', 'Projects']);
    expect(within(nav).getByRole('link', { name: 'Pages' })).toHaveAttribute(
      'href',
      '/pages',
    );
    expect(within(nav).getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
    expect(
      within(nav).queryByRole('link', { name: /Today|Notes|tasks/ }),
    ).not.toBeInTheDocument();
    // Public CMS only: no Notebook under Your apps.
    const apps = screen.getByRole('navigation', { name: 'Your apps' });
    expect(
      within(apps).queryByRole('link', { name: /Notebook/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Public CMS')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign out of Admin' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Posts' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/No posts yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/PRODUCTION API/i)).not.toBeInTheDocument();
  });

  test.each(['/home', '/resume'])('Pages stays current on %s', async (path) => {
    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route path="*" element={null} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    const nav = await screen.findByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: 'Pages' })).toHaveClass(
      'workspace-nav__item--active',
    );
    expect(within(nav).getByRole('link', { name: 'Posts' })).not.toHaveClass(
      'workspace-nav__item--active',
    );
  });

  const renderUsers = () =>
    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/settings/users']}>
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route path="settings/users" element={<AdminUsersPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    );
  const palette = () =>
    screen.queryByRole('dialog', { name: 'Search posts, projects and pages' });

  test('⌘K does nothing while the user drawer is open', async () => {
    vi.mocked(getAuthUser).mockResolvedValueOnce(fullAdmin);
    const user = userEvent.setup();
    renderUsers();
    await user.click(await screen.findByText('Sam Rivera'));
    const drawer = screen.getByRole('dialog', {
      name: 'Edit access for Sam Rivera',
    });

    await user.keyboard('{Control>}k{/Control}');
    expect(palette()).not.toBeInTheDocument();
    expect(drawer).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(drawer).not.toBeInTheDocument();
    await user.keyboard('{Control>}k{/Control}');
    expect(palette()).toBeInTheDocument();
  });

  test('search finds Users & access only for someone who has it', async () => {
    vi.mocked(getAuthUser).mockResolvedValueOnce(fullAdmin);
    const user = userEvent.setup();
    const { unmount } = renderPosts();
    await screen.findByRole('navigation', { name: 'Admin' });
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('users');
    expect(
      await screen.findByRole('option', { name: 'Users & access' }),
    ).toBeInTheDocument();
    unmount();

    renderPosts();
    await screen.findByRole('navigation', { name: 'Admin' });
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('users');
    expect(await screen.findByText('No matches.')).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Users & access' }),
    ).not.toBeInTheDocument();
  });

  test('shows PRODUCTION banner when Vite proxies to prod API', async () => {
    isDevProdApiTargetMock.mockReturnValue(true);

    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<AdminPostsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    expect(
      await screen.findByText(
        /PRODUCTION API — edits, autosave, and publish hit the live site/i,
      ),
    ).toBeInTheDocument();
  });
});
