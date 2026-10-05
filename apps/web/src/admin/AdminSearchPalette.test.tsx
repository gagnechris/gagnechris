import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import AdminSearchPalette from './AdminSearchPalette';

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string) => ({
      data:
        path === '/api/admin/posts'
          ? {
              items: [
                {
                  id: 'p1',
                  title: 'Shipping the sidebar',
                  slug: 'sidebar',
                  tags: ['notebook'],
                  status: 'draft',
                },
                {
                  id: 'p2',
                  title: 'Unrelated',
                  slug: 'other',
                  tags: [],
                  status: 'published',
                },
              ],
            }
          : { items: [{ id: 'j1', name: 'Notebook', slug: 'notebook' }] },
      error: undefined,
      response: { status: 200 },
    }),
  }),
}));

describe('AdminSearchPalette', () => {
  test('finds posts by tag and projects by name, then opens the editor', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={<AdminSearchPalette onClose={() => {}} />}
            />
            <Route path="/posts/:id" element={<p>Post editor</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    await user.type(
      screen.getByRole('combobox', {
        name: 'Search posts, projects and pages',
      }),
      'notebook',
    );
    const results = await screen.findByRole('listbox', { name: 'Results' });
    const options = within(results).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Shipping the sidebardraft/sidebar',
      'Notebook/projects/notebook',
    ]);

    await user.keyboard('{Enter}');
    expect(screen.getByText('Post editor')).toBeInTheDocument();
  });
});
