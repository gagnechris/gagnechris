import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  type Post,
  type Project,
} from '@gagnechris/shared';
import { runPublishTargets } from '../src/publish-targets/orchestrator.js';
import { publishTargets } from '../src/publish-targets/registry.js';
import {
  STATIC_OPTION_B_PAGES,
  allOptionBPages,
  collectAdminMutationPrefixes,
  collectAdminSoftDeletePrefixes,
  collectOptionBPaths,
  collectS3OutputPatterns,
} from '../src/publish-targets/surface.js';
import { memoryStorage } from './fixtures/memory-storage.js';
import nowPageTarget from './fixtures/now-page.target.js';

vi.mock('../src/viewer-request-slugs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/viewer-request-slugs.js')>()),
  syncViewerRequestKeys: vi.fn().mockResolvedValue(undefined),
}));

describe('publish surface collectors', () => {
  it('collects Option B paths from production targets plus static Vite pages', () => {
    expect(collectOptionBPaths(publishTargets)).toEqual([
      '/blog',
      '/projects',
      '/resume',
    ]);
    expect(allOptionBPages(publishTargets)).toEqual([
      '/blog',
      '/contact',
      '/dont-feed-the-bears',
      '/dont-feed-the-bears/camp',
      '/dont-feed-the-bears/wild',
      '/projects',
      '/resume',
    ]);
    expect([...STATIC_OPTION_B_PAGES].sort()).toEqual([
      '/contact',
      '/dont-feed-the-bears',
      '/dont-feed-the-bears/camp',
      '/dont-feed-the-bears/wild',
    ]);
  });

  it('includes /now when the now-page fixture is registered', () => {
    const targets = [...publishTargets, nowPageTarget];
    expect(collectOptionBPaths(targets)).toEqual([
      '/blog',
      '/now',
      '/projects',
      '/resume',
    ]);
    expect(allOptionBPages(targets)).toContain('/now');
    expect(collectAdminMutationPrefixes(targets)).toEqual([
      '/api/admin/home',
      '/api/admin/now',
      '/api/admin/posts',
      '/api/admin/projects',
      '/api/admin/resume',
    ]);
  });

  it('collects admin soft-delete only for targets that opt in', () => {
    expect(collectAdminSoftDeletePrefixes(publishTargets)).toEqual([
      '/api/admin/posts',
      '/api/admin/projects',
    ]);
    expect(
      collectAdminSoftDeletePrefixes([...publishTargets, nowPageTarget]),
    ).toEqual(['/api/admin/posts', '/api/admin/projects']);
  });
});

const awsSyncGlob = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
  );

describe('publisher-owned S3 keys', () => {
  it('cover every key a full rebuild writes, so web deploys never delete them', async () => {
    const at = '2026-10-01T00:00:00.000Z';
    const post: Post = {
      id: '01POSTSURFACE0000000000000',
      slug: 'hello',
      title: 'Hello',
      excerpt: '',
      bodyMarkdown: 'Body.',
      tags: [],
      projectIds: [],
      status: 'published',
      publishedAt: at,
      updatedAt: at,
      coverImage: null,
      seo: null,
      version: 1,
      hasUnpublishedChanges: false,
    };
    const project: Project = {
      id: '01PROJECTSURFACE0000000000',
      slug: 'notebook',
      name: 'Notebook',
      pitch: '',
      stage: 'building',
      stageNote: '',
      previewImage: null,
      bodyMarkdown: 'Body.',
      stack: [],
      links: [],
      demo: null,
      order: 0,
      href: null,
      status: 'published',
      publishedAt: at,
      updatedAt: at,
      version: 1,
      hasUnpublishedChanges: false,
    };
    const published = { status: 'published' as const, publishedAt: at };
    const storage = memoryStorage();
    await runPublishTargets({
      storage,
      sources: {
        readGeneration: async () => 0,
        listPublishedPosts: async () => ({ posts: [post], corruptSlugs: [] }),
        listPublishedProjects: async () => ({
          projects: [project],
          corruptSlugs: [],
        }),
        getPublishedResume: async () => ({
          status: 'ok',
          entity: {
            ...DEFAULT_RESUME,
            ...published,
            updatedAt: at,
            version: 1,
          },
        }),
        getPublishedHome: async () => ({
          status: 'ok',
          entity: { ...DEFAULT_HOME, ...published, updatedAt: at, version: 1 },
        }),
      },
      targets: publishTargets,
    });

    const owned = collectS3OutputPatterns(publishTargets).map(awsSyncGlob);
    // `_shell.html` and `index.html` are the web deploy's own files.
    const written = [...storage.objects.keys()].filter(
      (key) => key !== '_shell.html' && key !== 'index.html',
    );
    expect(written).toEqual(
      expect.arrayContaining([
        'blog/hello/index.html',
        'projects/notebook/index.html',
        'resume.pdf',
        'home/last-published.json',
      ]),
    );
    for (const key of written) {
      expect(
        owned.some((re) => re.test(key)),
        key,
      ).toBe(true);
    }
  });
});
