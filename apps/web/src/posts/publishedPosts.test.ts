import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderPostsIndexBodyHtml } from '@gagnechris/shared/render';
import {
  fetchPublishedPosts,
  postsIndexFromDocument,
  publishedPostPageUrl,
  publishedPostsUrl,
} from './publishedPosts';

const parse = (html: string): Document =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

describe('publishedPosts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test('publishedPostsUrl uses /__site when local site origin is set', () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', 'http://127.0.0.1:4177');
    expect(publishedPostsUrl()).toBe('/__site/posts/posts.json');
    expect(publishedPostPageUrl('hello')).toBe('/__site/posts/hello/');
  });

  test('publishedPostsUrl is same-origin without local site origin', () => {
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    expect(publishedPostsUrl()).toBe('/posts/posts.json');
    expect(publishedPostPageUrl('hello')).toBe('/posts/hello/');
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

  test('reads the list back out of the posts index prerender', () => {
    const html = renderPostsIndexBodyHtml([
      {
        id: '01A',
        slug: 'hello',
        title: 'Hello & welcome',
        excerpt: 'Short.',
        publishedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    expect(postsIndexFromDocument(parse(html))).toEqual([
      {
        id: '01A',
        slug: 'hello',
        title: 'Hello & welcome',
        excerpt: 'Short.',
        publishedAt: '2026-02-01',
        updatedAt: '',
        tags: [],
        coverImage: null,
      },
    ]);
    expect(postsIndexFromDocument(parse(renderPostsIndexBodyHtml([])))).toEqual(
      [],
    );
  });

  test('falls back to posts.json for a bare link-list index', () => {
    const legacy =
      '<section class="blog-index-prerender"><h1>Posts</h1><ul><li><a href="/posts/hello">Hello</a></li></ul></section>';
    expect(postsIndexFromDocument(parse(legacy))).toBeNull();
  });
});
