import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import type { Post, PostsPage } from '../src/query/api.js';
import {
  setCachedHome,
  setCachedPost,
  setCachedResume,
} from '../src/query/cache.js';
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

const listItems = (queryClient: QueryClient): Post[] => {
  const data = queryClient.getQueryData<{
    pages: PostsPage[];
  }>(queryKeys.posts.list());
  return data?.pages.flatMap((p) => p.items) ?? [];
};

describe('post cache helpers (CHR-131)', () => {
  test('setCachedPost upserts list + detail; deleted status drops from list', () => {
    const queryClient = new QueryClient();
    setCachedPost(queryClient, draftPost);
    expect(queryClient.getQueryData(queryKeys.posts.detail('01POST'))).toEqual(
      draftPost,
    );
    expect(listItems(queryClient)).toEqual([draftPost]);

    const published = {
      ...draftPost,
      status: 'published' as const,
      version: 2,
    };
    setCachedPost(queryClient, published);
    expect(listItems(queryClient)).toEqual([published]);

    setCachedPost(queryClient, {
      ...published,
      status: 'deleted',
      version: 3,
    });
    expect(listItems(queryClient)).toEqual([]);
    expect(queryClient.getQueryData(queryKeys.posts.detail('01POST'))).toEqual(
      expect.objectContaining({ status: 'deleted', version: 3 }),
    );
  });

  test('setCachedPost keeps a newer version when a stale write arrives (CHR-147)', () => {
    const queryClient = new QueryClient();
    const v2 = { ...draftPost, version: 2, title: 'Newer' };
    setCachedPost(queryClient, v2);
    setCachedPost(queryClient, { ...draftPost, version: 1, title: 'Stale' });
    expect(queryClient.getQueryData(queryKeys.posts.detail('01POST'))).toEqual(
      v2,
    );
    expect(listItems(queryClient)).toEqual([v2]);
  });
});

describe('home/resume cache helpers (CHR-147)', () => {
  test('setCachedHome/Resume ignore lower versions', () => {
    const queryClient = new QueryClient();
    const homeV2 = {
      name: 'Chris',
      title: 'Eng',
      about: 'About',
      status: 'draft' as const,
      publishedAt: null,
      updatedAt: '2026-09-28T00:00:00.000Z',
      seo: null,
      version: 2,
      hasUnpublishedChanges: false,
    };
    setCachedHome(queryClient, homeV2);
    setCachedHome(queryClient, { ...homeV2, version: 1, about: 'Stale' });
    expect(queryClient.getQueryData(queryKeys.home())).toEqual(homeV2);

    const resumeV2 = {
      ...DEFAULT_RESUME,
      version: 2,
      status: 'draft' as const,
      publishedAt: null,
      updatedAt: '2026-09-28T00:00:00.000Z',
      hasUnpublishedChanges: false,
    };
    setCachedResume(queryClient, resumeV2);
    setCachedResume(queryClient, { ...resumeV2, version: 1, name: 'Stale' });
    expect(queryClient.getQueryData(queryKeys.resume())).toEqual(resumeV2);
  });
});
