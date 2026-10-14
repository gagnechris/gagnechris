import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  resumeView,
  type Post,
  type Project,
} from '@gagnechris/shared';
import { runPublishTargets } from '../src/publish-targets/orchestrator.js';
import { publishTargets } from '../src/publish-targets/registry.js';
import type { RebuildSiteSources } from '../src/publish-targets/types.js';
import type { RebuildScope } from '../src/rebuild-scope.js';
import { memoryStorage } from './fixtures/memory-storage.js';

vi.mock('../src/viewer-request-slugs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/viewer-request-slugs.js')>()),
  syncViewerRequestKeys: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/resume-pdf.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/resume-pdf.js')>();
  return {
    ...actual,
    renderResumePdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50])),
  };
});

const project: Project = {
  id: '01PROJECT00000000000000000',
  slug: 'notebook',
  name: 'Notebook',
  pitch: '',
  stage: 'building',
  stageNote: '',
  previewImage: null,
  bodyMarkdown: 'Why.',
  stack: [],
  links: [],
  demo: null,
  order: 0,
  href: null,
  status: 'published',
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

const post: Post = {
  id: '01POSTFEED0000000000000000',
  slug: 'hello',
  title: 'Hello',
  excerpt: 'A first post.',
  bodyMarkdown: 'Some **bold** words.\n\n![Cover](/media/cover.png)',
  tags: [],
  projectIds: [project.id],
  status: 'published',
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

const publishable = {
  status: 'published' as const,
  publishedAt: '2026-09-27T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

const sources = (
  overrides: Partial<RebuildSiteSources> = {},
): RebuildSiteSources => ({
  readGeneration: async () => 0,
  listPublishedPosts: async () => ({ posts: [post], corruptSlugs: [] }),
  listPublishedProjects: async () => ({
    projects: [project],
    corruptSlugs: [],
  }),
  getPublishedResume: async () => ({
    status: 'ok',
    entity: { ...DEFAULT_RESUME, ...publishable, pdfPath: '/resume.pdf' },
  }),
  slugRedirectOwner: async () => undefined,
  getPublishedHome: async () => ({
    status: 'ok',
    entity: { ...DEFAULT_HOME, ...publishable },
  }),
  ...overrides,
});

const everything: RebuildScope = {
  allPosts: true,
  postSlugs: new Set(),
  slugsToRemove: new Set(),
  feeds: true,
  home: true,
  resume: true,
  projectIds: new Set(),
  touchedEntityTypes: new Set(['post', 'project', 'home', 'resume']),
};

const json = (objects: Map<string, string>, key: string): unknown =>
  JSON.parse(objects.get(key) ?? 'null');

describe('app JSON beside the public pages', () => {
  it('writes Home, each post and Resume for the iOS app', async () => {
    const storage = memoryStorage();
    await runPublishTargets({
      scope: everything,
      storage,
      sources: sources(),
      targets: publishTargets,
    });

    expect(json(storage.objects, 'home/index.json')).toEqual({
      name: DEFAULT_HOME.name,
      title: DEFAULT_HOME.title,
      about: DEFAULT_HOME.about,
    });
    expect(json(storage.objects, 'blog/hello/index.json')).toEqual({
      slug: 'hello',
      title: 'Hello',
      excerpt: 'A first post.',
      publishedAt: '2026-10-01T00:00:00.000Z',
      minutes: 1,
      partOf: [{ name: 'Notebook', href: '/projects/notebook' }],
      bodyMarkdown: post.bodyMarkdown,
    });
    expect(json(storage.objects, 'resume/index.json')).toEqual({
      available: true,
      headline: DEFAULT_RESUME.content.headline?.trim() || null,
      summary: DEFAULT_RESUME.content.summary,
      pdfPath: '/resume.pdf',
      view: JSON.parse(JSON.stringify(resumeView(DEFAULT_RESUME))),
    });
  });

  it('a Home publish invalidates its JSON', async () => {
    const storage = memoryStorage();
    await runPublishTargets({
      scope: {
        ...everything,
        allPosts: false,
        feeds: false,
        resume: false,
        touchedEntityTypes: new Set(['home']),
      },
      storage,
      sources: sources(),
      targets: publishTargets,
    });
    expect(storage.invalidations.flat()).toContain('/home/index.json');
  });

  it('an unpublished resume says so, and an unpublished post loses its JSON', async () => {
    const storage = memoryStorage();
    await runPublishTargets({
      scope: everything,
      storage,
      sources: sources(),
      targets: publishTargets,
    });
    await runPublishTargets({
      scope: {
        ...everything,
        allPosts: false,
        slugsToRemove: new Set(['hello']),
      },
      storage,
      sources: sources({
        listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
        getPublishedResume: async () => ({ status: 'missing' }),
      }),
      targets: publishTargets,
    });

    expect(json(storage.objects, 'resume/index.json')).toEqual({
      available: false,
    });
    expect(storage.objects.has('blog/hello/index.html')).toBe(false);
    expect(storage.objects.has('blog/hello/index.json')).toBe(false);
  });
});
