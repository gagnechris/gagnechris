import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import AdminLayout from './AdminLayout';
import AdminPostsPage from './AdminPostsPage';

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
  signOutUser: vi.fn(),
  getIdToken: vi.fn(async () => 'fake-id-token'),
}));

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async () => ({
      data: { items: [] },
      error: undefined,
      response: { status: 200 },
    }),
  }),
}));

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDevProdApiTargetMock.mockReturnValue(false);
    pending.value = false;
    pending.cleared = 0;
  });

  const renderLayout = () =>
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
    renderLayout();
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
      within(nav).getByRole('link', { name: 'Home page' }),
    ).toHaveAttribute('href', '/home');
    expect(
      within(nav).getByRole('link', { name: 'Resume' }),
    ).toBeInTheDocument();
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
    expect(await screen.findByText(/No posts match/i)).toBeInTheDocument();
    expect(screen.queryByText(/PRODUCTION API/i)).not.toBeInTheDocument();
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
