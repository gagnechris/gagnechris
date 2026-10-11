import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import { QueryClientTestProvider } from '../test-utils';
import AdminPagesPage from './AdminPagesPage';
import { adminApi } from '../mockAdminApi';

vi.mock('../workspace/api/client', () =>
  import('../mockAdminApi').then((m) => m.mockAdminApi()),
);

beforeEach(() => {
  vi.clearAllMocks();
  adminApi.GET.mockImplementation(async (path: string) => ({
    data:
      path === '/api/admin/home'
        ? { status: 'published', hasUnpublishedChanges: true, version: 3 }
        : { status: 'draft', hasUnpublishedChanges: false, version: 1 },
    error: undefined,
    response: { status: 200 },
  }));
});

test('lists Home page and Resume with their status', async () => {
  render(
    <QueryClientTestProvider>
      <MemoryRouter>
        <AdminPagesPage />
      </MemoryRouter>
    </QueryClientTestProvider>,
  );

  const list = screen.getByRole('list', { name: 'Site pages' });
  const home = within(list).getByRole('link', { name: /Home page/ });
  expect(home).toHaveAttribute('href', '/home');
  expect(await within(home).findByText('published')).toBeInTheDocument();
  expect(within(home).getByText('Unpublished changes')).toBeInTheDocument();

  const resume = within(list).getByRole('link', { name: /Resume/ });
  expect(resume).toHaveAttribute('href', '/resume');
  expect(await within(resume).findByText('draft')).toBeInTheDocument();
});
