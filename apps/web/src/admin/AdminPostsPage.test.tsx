import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
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

  const queryOf = (call: unknown[]) =>
    (call[1] as { params: { query: Record<string, unknown> } }).params.query;

  const respond = (data: unknown) => ({
    data,
    error: undefined,
    response: { status: 200 },
  });

  test('search goes to the server and finds posts beyond the loaded page', async () => {
    const user = userEvent.setup();
    get.mockImplementation(async (_path: string, init: unknown) => {
      const query = queryOf([_path, init]);
      if (query.q === 'deep') {
        return respond({
          items: [makePost({ id: '01DEEP', slug: 'deep', title: 'Deep cut' })],
        });
      }
      if (query.q) return respond({ items: [] });
      return respond({ items: [makePost()], nextCursor: 'page-2' });
    });
    render(
      <QueryClientTestProvider>
        <MemoryRouter>
          <AdminPostsPage />
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    expect(await screen.findByText('Hello')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search posts'), 'deep');
    expect(await screen.findByText('Deep cut')).toBeInTheDocument();
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
    expect(get.mock.calls.map(queryOf)).toContainEqual(
      expect.objectContaining({ q: 'deep' }),
    );

    await user.clear(screen.getByLabelText('Search posts'));
    await user.type(screen.getByLabelText('Search posts'), 'nope');
    expect(await screen.findByText('No posts match.')).toBeInTheDocument();
  });

  test('status filter goes to the server, with server counts across every page', async () => {
    const user = userEvent.setup();
    const live = makePost({
      id: '01LIVE',
      slug: 'live',
      title: 'Live one',
      tags: ['aws', 'cdk'],
      status: 'published',
      publishedAt: '2026-09-20T00:00:00.000Z',
    });
    const counts = { all: 150, draft: 30, published: 120 };
    get.mockImplementation(async (_path: string, init: unknown) => {
      const query = queryOf([_path, init]);
      if (query.status === 'published') {
        return respond({ items: [live], nextCursor: 'more', counts });
      }
      return respond({ items: [makePost(), live], nextCursor: 'more', counts });
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
    ).toEqual(['All150', 'Drafts30', 'Published120']);
    expect(screen.getByText('aws, cdk')).toBeInTheDocument();
    expect(screen.getByText('/live')).toBeInTheDocument();

    await user.click(within(filter).getByRole('radio', { name: /Published/ }));
    await waitFor(() => {
      expect(screen.queryByText('Hello')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Live one')).toBeInTheDocument();
    expect(get.mock.calls.map(queryOf)).toContainEqual(
      expect.objectContaining({ status: 'published' }),
    );
  });

  test('Load more fetches the next page with the same filters', async () => {
    const user = userEvent.setup();
    get.mockImplementation(async (_path: string, init: unknown) => {
      const query = queryOf([_path, init]);
      if (query.cursor === 'page-2') {
        return respond({
          items: [makePost({ id: '01TWO', slug: 'two', title: 'Second page' })],
        });
      }
      return respond({ items: [makePost()], nextCursor: 'page-2' });
    });
    render(
      <QueryClientTestProvider>
        <MemoryRouter>
          <AdminPostsPage />
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    await screen.findByText('Hello');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Second page')).toBeInTheDocument();
    expect(get.mock.calls.map(queryOf)).toContainEqual({
      limit: 100,
      cursor: 'page-2',
    });
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
    expect(post).toHaveBeenCalledWith('/api/admin/posts', {
      body: expect.objectContaining({
        title: 'Untitled',
        slug: expect.stringMatching(/^untitled-[a-z0-9]{6}$/),
      }),
    });
  });

  test('two new posts in a row get different slugs', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({
      data: makePost({ id: '01NEW', title: 'Untitled' }),
      error: undefined,
      response: { status: 201 },
    });
    render(
      <QueryClientTestProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<AdminPostsPage />} />
            <Route path="/posts/:postId" element={<Link to="/">back</Link>} />
          </Routes>
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    for (let i = 0; i < 2; i += 1) {
      await user.click(await screen.findByRole('button', { name: 'New post' }));
      await user.click(await screen.findByRole('link', { name: 'back' }));
    }
    const slugs = post.mock.calls.map(
      ([, init]) => (init as { body: { slug: string } }).body.slug,
    );
    expect(slugs).toHaveLength(2);
    expect(slugs[0]).not.toBe(slugs[1]);
  });

  test('shows a created row that is missing its timestamps', async () => {
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
    expect(titles).toEqual(['Untitled', 'Hello']);
  });
});
