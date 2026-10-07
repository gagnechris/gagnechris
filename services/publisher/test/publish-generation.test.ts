import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMetaItem,
  buildProjectPublishedItem,
  buildPublishedItem,
} from '@gagnechris/data';
import type { Post, Project } from '@gagnechris/shared';
import { runPublishTargets } from '../src/publish-targets/orchestrator.js';
import type {
  PublishTarget,
  RebuildSiteSources,
} from '../src/publish-targets/types.js';
import type { RebuildScope } from '../src/rebuild-scope.js';
import { desiredKvsKeys, kvsSyncCount } from './fixtures/kvs.js';
import { memoryStorage } from './fixtures/memory-storage.js';
import {
  BLOG_SLUG_NAMESPACE,
  type syncViewerRequestKeys,
} from '../src/viewer-request-slugs.js';
import { postSlugsFromKeys } from '../src/storage.js';

const ddbSend = vi.fn();
const syncKvs = vi.fn();
const addMetric = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => {
  class Command {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: {
      from: () => ({ send: (...args: unknown[]) => ddbSend(...args) }),
    },
    GetCommand: class GetCommand extends Command {},
    BatchGetCommand: class BatchGetCommand extends Command {},
    QueryCommand: class QueryCommand extends Command {},
  };
});

vi.mock('../src/viewer-request-slugs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/viewer-request-slugs.js')>()),
  syncViewerRequestKeys: (...args: unknown[]) => syncKvs(...args),
}));

vi.mock('../src/observability.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), addContext: vi.fn() },
  metrics: {
    addMetric: (...args: unknown[]) => addMetric(...args),
    clearMetrics: vi.fn(),
    publishStoredMetrics: vi.fn(),
  },
}));

const post = (slug: string, day: number): Post => ({
  id: `01POST${slug.toUpperCase()}`.padEnd(26, '0'),
  slug,
  title: `Post ${slug}`,
  excerpt: '',
  bodyMarkdown: 'Body.',
  tags: [],
  projectIds: [],
  status: 'published',
  publishedAt: `2026-10-0${day}T00:00:00.000Z`,
  updatedAt: `2026-10-0${day}T00:00:00.000Z`,
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
});

/** The table as the API leaves it: PUBLISHED rows, the site publish row, and a GSI1 that may lag. */
class FakeTable {
  generation = 0;
  readonly published = new Map<string, Post>();
  gsi: Post[] = [];

  publish(p: Post, opts: { gsi: boolean }): void {
    this.published.set(p.id, p);
    this.generation += 1;
    if (opts.gsi) this.gsi.push(p);
  }

  send = async (cmd: {
    input?: {
      IndexName?: string;
      Key?: { pk: string };
      RequestItems?: Record<string, { Keys: Array<{ pk: string }> }>;
    };
  }) => {
    const input = cmd.input;
    if (input?.IndexName) return { Items: this.gsi.map(buildMetaItem) };
    if (input?.Key?.pk === 'SITE#publish') {
      return {
        Item: {
          pk: 'SITE#publish',
          sk: 'META',
          generation: this.generation,
          postIds: new Set(this.published.keys()),
        },
      };
    }
    if (input?.RequestItems) {
      const name = Object.keys(input.RequestItems)[0]!;
      const rows = input.RequestItems[name]!.Keys.flatMap((k) => {
        const p = this.published.get(k.pk.slice('POST#'.length));
        return p ? [buildPublishedItem(p)] : [];
      });
      return { Responses: { [name]: rows } };
    }
    return {};
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const publishScope = (slug: string): RebuildScope => ({
  allPosts: false,
  postSlugs: new Set([slug]),
  slugsToRemove: new Set(),
  feeds: true,
  home: false,
  resume: false,
  projectIds: new Set(),
  touchedEntityTypes: new Set(['post']),
});

const feedSlugs = (objects: Map<string, string>): string[] =>
  (
    JSON.parse(objects.get('blog/posts.json')!) as {
      items: { slug: string }[];
    }
  ).items
    .map((i) => i.slug)
    .sort();

const resolvedBlogAllowlist = async (): Promise<string[]> =>
  (
    await desiredKvsKeys(
      syncKvs as unknown as typeof syncViewerRequestKeys,
      'blog',
    )
  ).sort();

describe('rebuilds against a lagging GSI1', () => {
  const prevTable = process.env.DATA_TABLE_NAME;

  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'test-table';
    ddbSend.mockReset();
    syncKvs.mockReset();
    addMetric.mockReset();
  });

  afterEach(() => {
    if (prevTable === undefined) delete process.env.DATA_TABLE_NAME;
    else process.env.DATA_TABLE_NAME = prevTable;
    vi.resetModules();
  });

  it('a stale rebuild that writes last still lists a post GSI1 has not indexed', async () => {
    const table = new FakeTable();
    const first = post('first', 1);
    const second = post('second', 2);
    table.publish(first, { gsi: true });
    ddbSend.mockImplementation(table.send);
    const { rebuildPublishedSite } = await import('../src/rebuild.js');
    const site = memoryStorage();

    const release = deferred();
    const writing = site.holdNextPut(release.promise);
    const stale = rebuildPublishedSite({
      scope: publishScope(first.slug),
      storage: site,
    });
    await writing;

    // Published while the first rebuild writes; GSI1 never sees it here.
    table.publish(second, { gsi: false });
    await rebuildPublishedSite({
      scope: publishScope(second.slug),
      storage: site,
    });
    release.resolve();
    await stale;

    expect(feedSlugs(site.objects)).toEqual(['first', 'second']);
    expect(site.objects.get('blog/index.html')).toContain(
      'href="/posts/second"',
    );
    expect(site.objects.get('rss.xml')).toContain('/posts/second');
    expect(site.objects.has('blog/second/index.html')).toBe(true);
    expect(await resolvedBlogAllowlist()).toEqual(['first', 'second']);
  });
  it('lists a just-published project GSI1 has not indexed', async () => {
    const project: Project = {
      id: '01PROJECTFRESH000000000000',
      slug: 'fresh',
      name: 'Fresh',
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
      publishedAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      version: 1,
      hasUnpublishedChanges: false,
    };
    ddbSend.mockImplementation(
      async (cmd: {
        input?: {
          IndexName?: string;
          Key?: { pk: string };
          RequestItems?: object;
        };
      }) => {
        if (cmd.input?.IndexName) return { Items: [] };
        if (cmd.input?.Key?.pk === 'SITE#publish') {
          return {
            Item: { generation: 1, projectIds: new Set([project.id]) },
          };
        }
        if (cmd.input?.RequestItems) {
          return {
            Responses: { 'test-table': [buildProjectPublishedItem(project)] },
          };
        }
        return {};
      },
    );
    const { listPublishedProjects } = await import('../src/catalog.js');

    const catalog = await listPublishedProjects('test-table');

    expect(catalog.projects.map((p) => p.slug)).toEqual(['fresh']);
  });
});

describe('the settle check', () => {
  const quietSources = (generation: () => number): RebuildSiteSources => ({
    readGeneration: async () => generation(),
    listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
    listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
    getPublishedResume: async () => ({ status: 'missing' }),
    getPublishedHome: async () => ({ status: 'missing' }),
  });

  const target = (
    run: PublishTarget['run'],
    opts: { shell?: boolean } = {},
  ): PublishTarget => ({
    id: 'probe',
    matches: () => true,
    needs: opts.shell ? { shell: true } : {},
    kvs: {
      namespace: BLOG_SLUG_NAMESPACE,
      pagePrefix: 'blog/',
      keysFromPageKeys: postSlugsFromKeys,
    },
    run,
  });

  beforeEach(() => {
    syncKvs.mockReset();
  });

  it('reruns when a web deploy replaced the shell during the pass', async () => {
    const site = memoryStorage({ shell: '<html>old shell</html>' });
    let runs = 0;
    await runPublishTargets({
      scope: publishScope('x'),
      storage: site,
      sources: quietSources(() => 1),
      targets: [
        target(
          async (ctx) => {
            runs += 1;
            if (runs === 1)
              site.objects.set('_shell.html', '<html>new shell</html>');
            return {
              artifacts: [
                {
                  key: 'page/index.html',
                  body: ctx.shell,
                  contentType: 'text/html',
                  cacheControl: 'no-cache',
                },
              ],
            };
          },
          { shell: true },
        ),
      ],
    });
    expect(runs).toBe(2);
    expect(site.objects.get('page/index.html')).toBe('<html>new shell</html>');
  });

  it('keeps flags from every pass', async () => {
    const site = memoryStorage();
    let generation = 1;
    let runs = 0;
    const result = await runPublishTargets({
      scope: publishScope('x'),
      storage: site,
      sources: quietSources(() => generation),
      targets: [
        target(async () => {
          runs += 1;
          if (runs === 1) {
            generation += 1;
            return { resumePdfFailed: true };
          }
          return { resumePublished: true };
        }),
      ],
    });
    expect(runs).toBe(2);
    expect(result.resumePdfFailed).toBe(true);
    expect(result.resumePublished).toBe(true);
  });

  it('invalidates and syncs the KVS once, after the last pass', async () => {
    const site = memoryStorage();
    let generation = 1;
    let runs = 0;
    const result = await runPublishTargets({
      scope: publishScope('x'),
      storage: site,
      sources: quietSources(() => generation),
      targets: [
        target(async () => {
          runs += 1;
          if (runs === 1) generation += 1;
          return {
            artifacts: [
              {
                key: `blog/p${runs}/index.html`,
                body: `pass ${runs}`,
                contentType: 'text/html',
                cacheControl: 'no-cache',
              },
            ],
            invalidationPaths: [`/posts/p${runs}`],
          };
        }),
      ],
    });
    expect(runs).toBe(2);
    expect(site.invalidations).toEqual([['/posts/p1', '/posts/p2']]);
    expect(result.invalidated).toEqual(['/posts/p1', '/posts/p2']);
    expect(
      kvsSyncCount(syncKvs as unknown as typeof syncViewerRequestKeys, 'blog'),
    ).toBe(1);
  });

  it('the blog KVS allowlist is the pages in storage when the sync resolves it', async () => {
    const site = memoryStorage();
    await runPublishTargets({
      scope: publishScope('mine'),
      storage: site,
      sources: quietSources(() => 1),
      targets: [
        target(async () => ({
          artifacts: [
            {
              key: 'blog/mine/index.html',
              body: 'mine',
              contentType: 'text/html',
              cacheControl: 'no-cache',
            },
          ],
        })),
      ],
    });
    // Another rebuild publishes a post after this one read its catalog.
    site.objects.set('blog/theirs/index.html', 'theirs');

    expect(await resolvedBlogAllowlist()).toEqual(['mine', 'theirs']);
  });
});
