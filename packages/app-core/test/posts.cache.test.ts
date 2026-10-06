import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import type { Post, PostSummary, PostsPage } from '../src/query/api.js';
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
  projectIds: [],
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-09-27T00:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

const summary = ({
  excerpt,
  bodyMarkdown,
  coverImage,
  seo,
  ...rest
}: Post): PostSummary => rest;

const listItems = (queryClient: QueryClient): PostSummary[] => {
  const data = queryClient.getQueryData<{
    pages: PostsPage[];
  }>(queryKeys.posts.list());
  return data?.pages.flatMap((p) => p.items) ?? [];
};

describe('post cache helpers', () => {
  test('setCachedPost upserts list (summary row) + detail; deleted status drops from list', () => {
    const queryClient = new QueryClient();
    setCachedPost(queryClient, draftPost);
    expect(queryClient.getQueryData(queryKeys.posts.detail('01POST'))).toEqual(
      draftPost,
    );
    expect(listItems(queryClient)).toEqual([summary(draftPost)]);

    const published = {
      ...draftPost,
      status: 'published' as const,
      version: 2,
    };
    setCachedPost(queryClient, published);
    expect(listItems(queryClient)).toEqual([summary(published)]);

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

  test('setCachedPost keeps a newer version when a stale write arrives', () => {
    const queryClient = new QueryClient();
    const v2 = { ...draftPost, version: 2, title: 'Newer' };
    setCachedPost(queryClient, v2);
    setCachedPost(queryClient, { ...draftPost, version: 1, title: 'Stale' });
    expect(queryClient.getQueryData(queryKeys.posts.detail('01POST'))).toEqual(
      v2,
    );
    expect(listItems(queryClient)).toEqual([summary(v2)]);
  });
});

describe('post cache helpers: filtered lists', () => {
  const seed = (queryClient: QueryClient, key: readonly unknown[]) =>
    queryClient.setQueryData(key, {
      pages: [{ items: [], counts: { all: 5, draft: 2, published: 3 } }],
      pageParams: [undefined],
    });
  const items = (queryClient: QueryClient, key: readonly unknown[]) =>
    queryClient
      .getQueryData<{ pages: PostsPage[] }>(key)
      ?.pages.flatMap((p) => p.items) ?? [];

  test('a search list takes a matching save and drops one that stops matching', () => {
    const queryClient = new QueryClient();
    const key = queryKeys.posts.list({ q: 'hel' });
    seed(queryClient, key);
    setCachedPost(queryClient, draftPost);
    expect(items(queryClient, key).map((p) => p.id)).toEqual(['01POST']);

    setCachedPost(queryClient, {
      ...draftPost,
      title: 'Bye',
      slug: 'bye',
      version: 2,
    });
    expect(items(queryClient, key)).toEqual([]);
  });

  test('a status change marks lists stale so their server counts refetch', () => {
    const queryClient = new QueryClient();
    const key = queryKeys.posts.list({ status: 'draft' });
    seed(queryClient, key);
    setCachedPost(queryClient, draftPost);
    queryClient.setQueryData(key, (prev: unknown) => prev);
    const before = queryClient.getQueryState(key)!.isInvalidated;
    setCachedPost(queryClient, { ...draftPost, version: 2, title: 'Edited' });
    expect(queryClient.getQueryState(key)!.isInvalidated).toBe(before);

    setCachedPost(queryClient, {
      ...draftPost,
      status: 'published',
      version: 3,
    });
    expect(queryClient.getQueryState(key)!.isInvalidated).toBe(true);
  });
});

describe('home/resume cache helpers', () => {
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
