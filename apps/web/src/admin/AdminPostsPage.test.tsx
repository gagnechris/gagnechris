import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import AdminPostsPage from './AdminPostsPage';

const post = vi.fn();
const get = vi.fn();

vi.mock('../api/client', () => ({
  createApiClient: () => ({
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
  }),
}));

describe('AdminPostsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: '01POST',
            slug: 'hello',
            title: 'Hello',
            excerpt: '',
            bodyMarkdown: '',
            tags: ['intro'],
            status: 'draft',
            publishedAt: null,
            updatedAt: '2026-09-27T00:00:00.000Z',
            coverImage: null,
            seo: null,
            version: 1,
            hasUnpublishedChanges: false,
          },
        ],
      },
      error: undefined,
      response: { status: 200 },
    });
  });

  test('lists posts and filters by search', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientTestProvider>
        <MemoryRouter>
          <AdminPostsPage />
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    expect(await screen.findByText('Hello')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search posts'), 'nope');
    await waitFor(() => {
      expect(screen.queryByText('Hello')).not.toBeInTheDocument();
    });
  });

  test('creates a draft and navigates to the editor', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({
      data: {
        id: '01NEW',
        slug: 'untitled',
        title: 'Untitled',
        status: 'draft',
      },
      error: undefined,
      response: { status: 201 },
    });

    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminPostsPage />} />
            <Route path="/admin/posts/:postId" element={<div>editor</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    await screen.findByText('Hello');
    await user.click(screen.getByRole('button', { name: 'New post' }));
    expect(await screen.findByText('editor')).toBeInTheDocument();
    expect(post).toHaveBeenCalled();
  });
});
