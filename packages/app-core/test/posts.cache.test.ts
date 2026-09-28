import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import type { Post } from '../src/query/api.js';
import { removeCachedPost, setCachedPost } from '../src/query/cache.js';
import { queryKeys } from '../src/query/keys.js';

const draftPost: Post = {
  id: '01POST',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: '',
  tags: [],
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-09-27T00:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

describe('post cache helpers (CHR-131)', () => {
  test('setCachedPost upserts list + detail; removeCachedPost clears both', () => {
    const queryClient = new QueryClient();
    setCachedPost(queryClient, draftPost);
    expect(queryClient.getQueryData(queryKeys.posts.detail('01POST'))).toEqual(
      draftPost,
    );
    expect(queryClient.getQueryData(queryKeys.posts.list())).toEqual([
      draftPost,
    ]);

    const published = {
      ...draftPost,
      status: 'published' as const,
      version: 2,
    };
    setCachedPost(queryClient, published);
    expect(queryClient.getQueryData(queryKeys.posts.list())).toEqual([
      published,
    ]);

    removeCachedPost(queryClient, '01POST');
    expect(
      queryClient.getQueryData(queryKeys.posts.detail('01POST')),
    ).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.posts.list())).toEqual([]);
  });
});
