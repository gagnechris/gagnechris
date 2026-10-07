import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@gagnechris/shared';
import { runPublishTargets } from '../src/publish-targets/orchestrator.js';
import { publishTargets } from '../src/publish-targets/registry.js';
import type { RebuildSiteSources } from '../src/publish-targets/types.js';
import type { RebuildScope } from '../src/rebuild-scope.js';
import type { SiteStorage } from '../src/storage.js';

vi.mock('../src/viewer-request-slugs.js', () => ({
  syncViewerRequestBlogSlugs: vi.fn().mockResolvedValue(undefined),
  syncViewerRequestProjectSlugs: vi.fn().mockResolvedValue(undefined),
}));

const SHELL =
  '<html><head><title>x</title></head><body><div id="root"></div></body></html>';

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

function memoryStorage() {
  const objects = new Map<string, string>();
  const invalidations: string[][] = [];
  const storage: SiteStorage = {
    async readShell() {
      return SHELL;
    },
    async read(key) {
      return objects.get(key);
    },
    async put(key, body) {
      const text = typeof body === 'string' ? body : '';
      if (objects.get(key) === text) return false;
      objects.set(key, text);
      return true;
    },
    async delete(key) {
      return objects.delete(key);
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix));
    },
    async invalidate(paths) {
      if (paths.length > 0) invalidations.push([...paths]);
    },
  };
  return { storage, objects, invalidations };
}

const sources: RebuildSiteSources = {
  readGeneration: async () => 0,
  listPublishedPosts: async () => ({ posts: [kept], corruptSlugs: [] }),
  listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
  getPublishedResume: async () => ({ status: 'missing' }),
  getPublishedHome: async () => ({ status: 'missing' }),
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
    const { storage, invalidations } = memoryStorage();
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
    const { storage, objects, invalidations } = memoryStorage();
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
});
