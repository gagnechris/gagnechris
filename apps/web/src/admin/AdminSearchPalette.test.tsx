import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import AdminSearchPalette from './AdminSearchPalette';

const postQueries = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (
      path: string,
      init?: { params?: { query?: Record<string, unknown> } },
    ) => {
      if (path !== '/api/admin/posts') {
        return {
          data: { items: [{ id: 'j1', name: 'Notebook', slug: 'notebook' }] },
          error: undefined,
          response: { status: 200 },
        };
      }
      const query = init?.params?.query ?? {};
      postQueries.push(query);
      // Only the server knows about this post; nothing in a loaded list holds it.
      const items =
        query.q === 'notebook'
          ? [
              {
                id: 'p1',
                title: 'Shipping the sidebar',
                slug: 'sidebar',
                tags: ['notebook'],
                status: 'draft',
              },
            ]
          : [];
      return {
        data: { items },
        error: undefined,
        response: { status: 200 },
      };
    },
  }),
}));

describe('AdminSearchPalette', () => {
  test('searches posts on the server and projects by name, then opens the editor', async () => {
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
    await screen.findByText('Shipping the sidebar');
    const results = screen.getByRole('listbox', { name: 'Results' });
    const options = within(results).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Shipping the sidebardraft/sidebar',
      'Notebook/projects/notebook',
    ]);

    expect(postQueries).toEqual([{ limit: 8, q: 'notebook' }]);

    await user.keyboard('{Enter}');
    expect(screen.getByText('Post editor')).toBeInTheDocument();
  });
});
