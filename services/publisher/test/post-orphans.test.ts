import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@gagnechris/shared';
import { runPublishTargets } from '../src/publish-targets/orchestrator.js';
import { publishTargets } from '../src/publish-targets/registry.js';
import type { RebuildSiteSources } from '../src/publish-targets/types.js';
import { fullRebuildScope, type RebuildScope } from '../src/rebuild-scope.js';
import { memoryStorage } from './fixtures/memory-storage.js';

vi.mock('../src/viewer-request-slugs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/viewer-request-slugs.js')>()),
  syncViewerRequestKeys: vi.fn().mockResolvedValue(undefined),
}));

const kept: Post = {
  id: '01POSTKEPT0000000000000000',
  slug: 'kept',
  title: 'Kept',
  excerpt: '',
  bodyMarkdown: 'Body.',
  tags: [],
  projectIds: [],
  status: 'published',
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

const sources: RebuildSiteSources = {
  readGeneration: async () => 0,
  listPublishedPosts: async () => ({ posts: [kept], corruptSlugs: [] }),
  listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
  getPublishedResume: async () => ({ status: 'missing' }),
  getPublishedHome: async () => ({ status: 'missing' }),
  slugRedirectOwner: async (kind, slug) =>
    kind === 'post' && slug === 'renamed' ? kept.id : undefined,
};

const unpublishScope = (slug: string): RebuildScope => ({
  allPosts: false,
  postSlugs: new Set(),
  slugsToRemove: new Set([slug]),
  feeds: true,
  home: true,
  resume: false,
  projectIds: new Set(),
  touchedEntityTypes: new Set(['post']),
});

describe('post orphan deletes', () => {
  it('removing a page that is already gone reports nothing and invalidates nothing', async () => {
    const storage = memoryStorage();
    const { invalidations } = storage;
    await runPublishTargets({
      scope: unpublishScope('gone'),
      storage,
      sources,
      targets: publishTargets,
    });
    invalidations.length = 0;

    const result = await runPublishTargets({
      scope: unpublishScope('gone'),
      storage,
      sources,
      targets: publishTargets,
    });

    expect(invalidations).toEqual([]);
    expect(result.invalidated).toEqual([]);
    expect(result.removedSlugs).toEqual([]);
  });

  it('removing a live page reports its slug and invalidates the blog', async () => {
    const storage = memoryStorage();
    const { objects, invalidations } = storage;
    await runPublishTargets({
      scope: unpublishScope('gone'),
      storage,
      sources,
      targets: publishTargets,
    });
    objects.set('blog/gone/index.html', '<html>gone</html>');
    invalidations.length = 0;

    const result = await runPublishTargets({
      scope: unpublishScope('gone'),
      storage,
      sources,
      targets: publishTargets,
    });

    expect(objects.has('blog/gone/index.html')).toBe(false);
    expect(result.removedSlugs).toEqual(['gone']);
    expect(invalidations).toEqual([
      expect.arrayContaining(['/blog*', '/rss.xml']),
    ]);
  });

  it("a renamed post's old page becomes a redirect to its new slug", async () => {
    const storage = memoryStorage({
      seed: {
        'blog/renamed/index.html': '<html>old</html>',
        'blog/renamed/index.json': '{}',
      },
    });

    const result = await runPublishTargets({
      scope: unpublishScope('renamed'),
      storage,
      sources,
      targets: publishTargets,
    });

    expect(storage.redirects.get('blog/renamed/index.html')).toBe(
      '/posts/kept',
    );
    expect(storage.objects.get('blog/renamed/index.html')).toContain(
      'https://gagnechris.com/posts/kept',
    );
    expect(storage.objects.has('blog/renamed/index.json')).toBe(false);
    expect(result.removedSlugs).toEqual([]);
  });

  it('unpublishing a post also removes the redirects from its earlier slugs', async () => {
    const leaving = '01POSTLEAVING0000000000000';
    const storage = memoryStorage({
      seed: {
        'blog/now/index.html': '<html>live</html>',
        'blog/before/index.html': '<html>redirect</html>',
        'blog/renamed/index.html': '<html>redirect</html>',
      },
    });

    const result = await runPublishTargets({
      scope: unpublishScope('now'),
      storage,
      sources: {
        ...sources,
        slugRedirectOwner: async (kind, slug) =>
          kind !== 'post'
            ? undefined
            : slug === 'before'
              ? leaving
              : slug === 'renamed'
                ? kept.id
                : undefined,
      },
      targets: publishTargets,
    });

    expect(storage.objects.has('blog/now/index.html')).toBe(false);
    expect(storage.objects.has('blog/before/index.html')).toBe(false);
    expect(storage.redirects.get('blog/renamed/index.html')).toBe(
      '/posts/kept',
    );
    expect(result.removedSlugs).toEqual(
      expect.arrayContaining(['now', 'before']),
    );
  });

  it('a full rebuild keeps a redirect and drops one whose post is gone', async () => {
    const storage = memoryStorage({
      seed: {
        'blog/renamed/index.html': '<html>old</html>',
        'blog/unowned/index.html': '<html>old</html>',
      },
    });

    await runPublishTargets({
      scope: fullRebuildScope(),
      storage,
      sources,
      targets: publishTargets,
    });

    expect(storage.redirects.get('blog/renamed/index.html')).toBe(
      '/posts/kept',
    );
    expect(storage.objects.has('blog/unowned/index.html')).toBe(false);
  });
});
