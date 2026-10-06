import { describe, expect, it, vi } from 'vitest';
import type { Post, Project } from '@gagnechris/shared';
import {
  MAX_PUBLISH_PASSES,
  runPublishTargets,
} from '../src/publish-targets/orchestrator.js';
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

const post = (slug: string, publishedAt: string): Post => ({
  id: `01POST${slug.toUpperCase()}`.padEnd(26, '0'),
  slug,
  title: `Post ${slug}`,
  excerpt: '',
  bodyMarkdown: 'Body.',
  tags: [],
  projectIds: [],
  status: 'published',
  publishedAt,
  updatedAt: publishedAt,
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
});

const project = (slug: string): Project => ({
  id: `01PROJECT${slug.toUpperCase()}`.padEnd(26, '0'),
  slug,
  name: `Project ${slug}`,
  pitch: '',
  stage: 'building',
  stageNote: '',
  previewImage: null,
  bodyMarkdown: '## Why I built it\n\nBecause.',
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
});

function memoryStorage(): SiteStorage & { objects: Map<string, string> } {
  const objects = new Map<string, string>();
  return {
    objects,
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
    async invalidate() {},
  };
}

/** `generation` moves on every publish, like the site publish row. */
type Table = { posts: Post[]; projects: Project[]; generation: number };

type Hold = {
  listing: 'posts' | 'projects';
  read: () => void;
  until: Promise<void>;
};

/** Reads the table as it is at call time; `hold` delays the first read's answer. */
function tableSources(table: Table, hold?: Hold): RebuildSiteSources {
  let held = false;
  const answer = async <T>(listing: Hold['listing'], value: T) => {
    if (hold?.listing === listing && !held) {
      held = true;
      hold.read();
      await hold.until;
    }
    return value;
  };
  return {
    readGeneration: async () => table.generation,
    listPublishedPosts: () =>
      answer('posts', { posts: [...table.posts], corruptSlugs: [] }),
    listPublishedProjects: () =>
      answer('projects', { projects: [...table.projects], corruptSlugs: [] }),
    getPublishedResume: async () => ({ status: 'missing' }),
    getPublishedHome: async () => ({ status: 'missing' }),
  };
}

const postPublishScope = (slug: string): RebuildScope => ({
  allPosts: false,
  postSlugs: new Set([slug]),
  slugsToRemove: new Set(),
  feeds: true,
  home: true,
  resume: false,
  projectIds: new Set(),
  touchedEntityTypes: new Set(['post']),
});

const projectPublishScope = (id: string): RebuildScope => ({
  allPosts: false,
  postSlugs: new Set(),
  slugsToRemove: new Set(),
  feeds: false,
  home: true,
  resume: false,
  projectIds: new Set([id]),
  touchedEntityTypes: new Set(['project']),
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('two rebuilds that overlap', () => {
  it('a rebuild that read the posts before a second publish does not drop that post', async () => {
    const storage = memoryStorage();
    const first = post('first', '2026-10-01T00:00:00.000Z');
    const second = post('second', '2026-10-02T00:00:00.000Z');
    const table: Table = { posts: [first], projects: [], generation: 1 };
    const read = deferred();
    const gate = deferred();

    const stale = runPublishTargets({
      scope: postPublishScope(first.slug),
      storage,
      sources: tableSources(table, {
        listing: 'projects',
        read: read.resolve,
        until: gate.promise,
      }),
      targets: publishTargets,
    });
    await read.promise;
    table.posts.push(second);
    table.generation += 1;
    await runPublishTargets({
      scope: postPublishScope(second.slug),
      storage,
      sources: tableSources(table),
      targets: publishTargets,
    });
    expect(storage.objects.get('blog/index.html')).toContain(
      'href="/posts/second"',
    );

    gate.resolve();
    await stale;

    const { items } = JSON.parse(storage.objects.get('blog/posts.json')!) as {
      items: { slug: string }[];
    };
    expect(items.map((i) => i.slug).sort()).toEqual(['first', 'second']);
    expect(storage.objects.get('blog/index.html')).toContain(
      'href="/posts/second"',
    );
    expect(storage.objects.get('rss.xml')).toContain('/posts/second');
    expect(storage.objects.get('index.html')).toContain('href="/posts/second"');
    expect(storage.objects.has('blog/second/index.html')).toBe(true);
  });

  it('a rebuild that read the projects before a second publish keeps that project and its page', async () => {
    const storage = memoryStorage();
    const first = project('first');
    const second = project('second');
    const table: Table = { posts: [], projects: [first], generation: 1 };
    const read = deferred();
    const gate = deferred();

    const stale = runPublishTargets({
      scope: projectPublishScope(first.id),
      storage,
      sources: tableSources(table, {
        listing: 'projects',
        read: read.resolve,
        until: gate.promise,
      }),
      targets: publishTargets,
    });
    await read.promise;
    table.projects.push(second);
    table.generation += 1;
    await runPublishTargets({
      scope: projectPublishScope(second.id),
      storage,
      sources: tableSources(table),
      targets: publishTargets,
    });
    expect(storage.objects.has('projects/second/index.html')).toBe(true);

    gate.resolve();
    await stale;

    const index = storage.objects.get('projects/index.html')!;
    expect(index).toContain('data-slug="first"');
    expect(index).toContain('data-slug="second"');
    expect(storage.objects.has('projects/second/index.html')).toBe(true);
    expect(storage.objects.get('index.html')).toContain('Project second');
  });

  it('stops after a bounded number of passes when publishes keep landing', async () => {
    const storage = memoryStorage();
    const table: Table = { posts: [], projects: [], generation: 0 };
    let reads = 0;
    const sources = tableSources(table);
    await runPublishTargets({
      scope: postPublishScope('p0'),
      storage,
      sources: {
        ...sources,
        listPublishedPosts: async () => {
          reads += 1;
          table.posts.push(post(`p${reads}`, '2026-10-01T00:00:00.000Z'));
          table.generation += 1;
          return sources.listPublishedPosts();
        },
      },
      targets: publishTargets,
    });
    expect(reads).toBe(MAX_PUBLISH_PASSES);
  });

  it('reads the catalog once and the generation twice when nothing changed', async () => {
    const storage = memoryStorage();
    const table: Table = {
      posts: [post('only', '2026-10-01T00:00:00.000Z')],
      projects: [],
      generation: 3,
    };
    const sources = tableSources(table);
    const listPublishedPosts = vi.fn(sources.listPublishedPosts);
    const readGeneration = vi.fn(sources.readGeneration);
    await runPublishTargets({
      scope: postPublishScope('only'),
      storage,
      sources: { ...sources, listPublishedPosts, readGeneration },
      targets: publishTargets,
    });
    expect(listPublishedPosts).toHaveBeenCalledTimes(1);
    expect(readGeneration).toHaveBeenCalledTimes(2);
  });
});
