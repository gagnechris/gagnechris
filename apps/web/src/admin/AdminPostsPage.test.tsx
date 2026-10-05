import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Post } from '@gagnechris/app-core';
import { QueryClientTestProvider } from '../test-utils';
import AdminPostsPage from './AdminPostsPage';

const post = vi.fn();
const get = vi.fn();

const makePost = (overrides: Partial<Post> = {}): Post => ({
  id: '01POST',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: '',
  tags: ['intro'],
  projectIds: [],
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-09-27T00:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
  ...overrides,
});

vi.mock('../workspace/api/client', () => ({
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
        items: [makePost()],
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

  test('filters by status, with a count on each option', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({
      data: {
        items: [
          makePost(),
          makePost({
            id: '01LIVE',
            slug: 'live',
            title: 'Live one',
            tags: ['aws', 'cdk'],
            status: 'published',
            publishedAt: '2026-09-20T00:00:00.000Z',
          }),
        ],
      },
      error: undefined,
      response: { status: 200 },
    });
    render(
      <QueryClientTestProvider>
        <MemoryRouter>
          <AdminPostsPage />
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    await screen.findByText('Hello');
    const filter = screen.getByRole('radiogroup', { name: 'Filter by status' });
    expect(
      within(filter)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['All2', 'Drafts1', 'Published1']);
    expect(screen.getByText('aws, cdk')).toBeInTheDocument();
    expect(screen.getByText('/live')).toBeInTheDocument();

    await user.click(within(filter).getByRole('radio', { name: /Published/ }));
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
    expect(screen.getByText('Live one')).toBeInTheDocument();
  });

  test('creates a draft and navigates to the editor', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({
      data: makePost({ id: '01NEW', slug: 'untitled', title: 'Untitled' }),
      error: undefined,
      response: { status: 201 },
    });

    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<AdminPostsPage />} />
            <Route path="/posts/:postId" element={<div>editor</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    await screen.findByText('Hello');
    await user.click(screen.getByRole('button', { name: 'New post' }));
    expect(await screen.findByText('editor')).toBeInTheDocument();
    expect(post).toHaveBeenCalled();
  });

  test('sorts a created row that is missing its timestamps', async () => {
    const user = userEvent.setup();
    const partial: Partial<Post> = {
      id: '01NEW',
      slug: 'untitled',
      title: 'Untitled',
      status: 'draft',
    };
    post.mockResolvedValue({
      data: partial,
      error: undefined,
      response: { status: 201 },
    });

    render(
      <QueryClientTestProvider>
        <MemoryRouter>
          <AdminPostsPage />
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    await screen.findByText('Hello');
    await user.click(screen.getByRole('button', { name: 'New post' }));
    expect(await screen.findByText('Untitled')).toBeInTheDocument();
    const titles = screen
      .getAllByRole('link')
      .map((a) => a.querySelector('.admin-table__title')?.textContent);
    expect(titles).toEqual(['Hello', 'Untitled']);

    await user.selectOptions(screen.getByLabelText('Sort'), 'published');
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });
});
