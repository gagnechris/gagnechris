import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  fetchPublishedPosts,
  publishedPostPageUrl,
  publishedPostsUrl,
} from './publishedPosts';

describe('publishedPosts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('publishedPostsUrl uses /__site when local site origin is set', () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', 'http://127.0.0.1:4177');
    expect(publishedPostsUrl()).toBe('/__site/writing/posts.json');
    expect(publishedPostPageUrl('hello')).toBe('/__site/writing/hello/');
  });

  test('publishedPostsUrl is same-origin without local site origin', () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    expect(publishedPostsUrl()).toBe('/writing/posts.json');
    expect(publishedPostPageUrl('hello')).toBe('/writing/hello/');
  });

  test('fetchPublishedPosts filters empty slugs and returns items', async () => {
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
              title: 'Hello',
              excerpt: '',
              publishedAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              tags: [],
              coverImage: null,
            },
            {
              id: '2',
              slug: '  ',
              title: 'No slug',
              excerpt: '',
              publishedAt: null,
              updatedAt: '2026-01-01T00:00:00.000Z',
              tags: [],
              coverImage: null,
            },
          ],
        }),
      }),
    );

    const posts = await fetchPublishedPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0]?.slug).toBe('hello');
  });
});
