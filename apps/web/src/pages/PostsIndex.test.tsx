import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import PostsIndex from './PostsIndex';

describe('PostsIndex', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('lists posts from posts.json', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: '1',
              slug: 'hello',
              title: 'Hello World',
              excerpt: 'An excerpt',
              publishedAt: '2026-02-01T00:00:00.000Z',
              updatedAt: '2026-02-01T00:00:00.000Z',
              tags: [],
              coverImage: null,
            },
          ],
        }),
      }),
    );

    render(
      <MemoryRouter>
        <PostsIndex />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('link', { name: /Hello World/ }),
    ).toHaveAttribute('href', '/posts/hello');
    expect(
      screen.getByRole('heading', { level: 2, name: '2026' }),
    ).toBeVisible();
    expect(screen.getByText('An excerpt')).toBeInTheDocument();
    const time = screen.getByText('Feb 1');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', '2026-02-01');
    expect(fetch).toHaveBeenCalledWith(
      '/posts/posts.json',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  test('shows empty state when posts.json has no items', async () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      }),
    );

    render(
      <MemoryRouter>
        <PostsIndex />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/No posts yet/i)).toBeInTheDocument();
    });
  });
});
