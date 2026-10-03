import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Post } from '@gagnechris/shared';
import type { SiteStorage } from '../src/storage.js';
import type { RebuildScope } from '../src/rebuild-scope.js';

const ddbSend = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: (...args: unknown[]) => ddbSend(...args) }),
  },
  GetCommand: class GetCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutCommand: class PutCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  BatchGetCommand: class BatchGetCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  QueryCommand: class QueryCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

vi.mock('../src/viewer-request-slugs.js', () => ({
  syncViewerRequestBlogSlugs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/resume-pdf.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/resume-pdf.js')>();
  return {
    ...actual,
    renderResumePdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50])),
  };
});

function makePost(slug: string, n: number): Post {
  return {
    id: String(n),
    slug,
    title: `Post ${slug}`,
    excerpt: 'ex',
    bodyMarkdown: `# ${slug}`,
    tags: [],
    status: 'published',
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    coverImage: null,
    seo: null,
    version: 1,
    hasUnpublishedChanges: false,
  };
}

function postPublished(post: Post) {
  return {
    pk: `POST#${post.id}`,
    sk: 'PUBLISHED',
    entityType: 'post',
    postId: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    bodyMarkdown: post.bodyMarkdown,
    tags: post.tags,
    status: post.status,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    coverImage: post.coverImage,
    seo: post.seo,
    version: post.version,
  };
}

/** Published META row as returned by gsi1 STATUS#published. */
function postMeta(post: Post) {
  return {
    ...postPublished(post),
    sk: 'META',
    gsi1pk: 'STATUS#published',
  };
}

function memoryStorage(): SiteStorage & {
  puts: string[];
  deletes: string[];
  invalidations: string[][];
} {
  const shell = '<html><head></head><body><div id="root"></div></body></html>';
  const objects = new Map<string, string>();
  objects.set('_shell.html', shell);
  objects.set('index.html', shell);
  const puts: string[] = [];
  const deletes: string[] = [];
  const invalidations: string[][] = [];
  return {
    puts,
    deletes,
    invalidations,
    async readShell() {
      return objects.get('_shell.html') ?? shell;
    },
    async read(key) {
      return objects.get(key);
    },
    async put(key, body) {
      const next =
        typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
      const prev = objects.get(key);
      if (prev === next) return false;
      objects.set(key, next);
      puts.push(key);
      return true;
    },
    async delete(key) {
      if (!objects.has(key)) return false;
      objects.delete(key);
      deletes.push(key);
      return true;
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix));
    },
    async invalidate(paths) {
      invalidations.push([...paths]);
    },
  };
}

describe('rebuildPublishedSite selective scope', () => {
  const prevTable = process.env.DATA_TABLE_NAME;

  beforeEach(async () => {
    process.env.DATA_TABLE_NAME = 'test-table';
    ddbSend.mockReset();
    const { syncViewerRequestBlogSlugs } =
      await import('../src/viewer-request-slugs.js');
    vi.mocked(syncViewerRequestBlogSlugs).mockReset();
    vi.mocked(syncViewerRequestBlogSlugs).mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (prevTable === undefined) delete process.env.DATA_TABLE_NAME;
    else process.env.DATA_TABLE_NAME = prevTable;
    vi.resetModules();
  });

  it('home-only scope does not put post pages, feeds, or resume', async () => {
    ddbSend.mockImplementation(
      async (cmd: { input?: { Key?: { pk?: string } } }) => {
        if (cmd.input?.Key?.pk === 'HOME#current') {
          return {
            Item: {
              pk: 'HOME#current',
              sk: 'PUBLISHED',
              entityType: 'home',
              status: 'published',
              name: 'Chris',
              title: 'Engineer',
              about: 'Hello',
              publishedAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
              version: 1,
            },
          };
        }
        return { Items: [] };
      },
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const { renderResumePdf } = await import('../src/resume-pdf.js');
    const { syncViewerRequestBlogSlugs } =
      await import('../src/viewer-request-slugs.js');

    const storage = memoryStorage();
    const scope: RebuildScope = {
      allPosts: false,
      postSlugs: new Set(),
      slugsToRemove: new Set(),
      feeds: false,
      home: true,
      resume: false,
      touchedEntityTypes: new Set(),
    };

    const result = await rebuildPublishedSite({ scope, storage });

    expect(storage.puts).toEqual(['index.html', 'home/last-published.json']);
    expect(storage.deletes).toEqual([]);
    expect(result.homePublished).toBe(true);
    expect(result.homeRestoredFromSnapshot).toBe(false);
    expect(result.resumePublished).toBe(false);
    expect(result.resumeUnpublished).toBe(false);
    expect(result.invalidated.sort()).toEqual(['/', '/index.html']);
    expect(renderResumePdf).not.toHaveBeenCalled();
    expect(syncViewerRequestBlogSlugs).not.toHaveBeenCalled();
    expect(
      ddbSend.mock.calls.some(
        (call) =>
          call[0] &&
          typeof call[0] === 'object' &&
          'input' in call[0] &&
          (call[0] as { input?: { IndexName?: string } }).input?.IndexName ===
            'gsi1',
      ),
    ).toBe(false);
  });

  it('single-post scope puts only that post + feeds among 50 published', async () => {
    const posts = Array.from({ length: 50 }, (_, i) =>
      makePost(`post-${i}`, i),
    );

    ddbSend.mockImplementation(
      async (cmd: {
        constructor?: { name?: string };
        input?: {
          IndexName?: string;
          RequestItems?: Record<string, { Keys: Array<{ pk: string }> }>;
        };
      }) => {
        if (cmd.input?.IndexName === 'gsi1') {
          return { Items: posts.map(postMeta) };
        }
        if (cmd.input?.RequestItems) {
          const table = Object.keys(cmd.input.RequestItems)[0]!;
          const keys = cmd.input.RequestItems[table]!.Keys;
          const wanted = new Set(keys.map((k) => k.pk));
          return {
            Responses: {
              [table]: posts
                .filter((p) => wanted.has(`POST#${p.id}`))
                .map(postPublished),
            },
          };
        }
        return {};
      },
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const { renderResumePdf } = await import('../src/resume-pdf.js');
    const { syncViewerRequestBlogSlugs } =
      await import('../src/viewer-request-slugs.js');

    const storage = memoryStorage();
    const scope: RebuildScope = {
      allPosts: false,
      postSlugs: new Set(['post-7']),
      slugsToRemove: new Set(),
      feeds: true,
      home: false,
      resume: false,
      touchedEntityTypes: new Set(),
    };

    const result = await rebuildPublishedSite({ scope, storage });

    const postPuts = storage.puts.filter((k) =>
      /^blog\/post-\d+\/index\.html$/.test(k),
    );
    expect(postPuts).toEqual(['blog/post-7/index.html']);
    expect(storage.puts).toEqual(
      expect.arrayContaining([
        'blog/post-7/index.html',
        'blog/index.html',
        'blog/posts.json',
        'blog/slugs.json',
        'sitemap.xml',
        'rss.xml',
      ]),
    );
    expect(storage.puts.some((k) => k === 'resume/index.html')).toBe(false);
    expect(result.invalidated.length).toBeLessThanOrEqual(5);
    expect(result.invalidated).toEqual(
      expect.arrayContaining(['/blog*', '/sitemap.xml', '/rss.xml']),
    );
    expect(renderResumePdf).not.toHaveBeenCalled();
    expect(syncViewerRequestBlogSlugs).toHaveBeenCalledOnce();
  });

  it('retries BatchGet UnprocessedKeys so draft META is never published', async () => {
    const published = makePost('welcome', 1);
    const draftTitle = 'DRAFT TITLE MUST NOT GO LIVE';
    let batchCalls = 0;

    ddbSend.mockImplementation(
      async (cmd: {
        constructor?: { name?: string };
        input?: {
          IndexName?: string;
          RequestItems?: Record<string, { Keys: Array<{ pk: string }> }>;
          Key?: { pk: string; sk: string };
        };
      }) => {
        if (cmd.input?.IndexName === 'gsi1') {
          return {
            Items: [
              {
                ...postMeta(published),
                title: draftTitle,
                bodyMarkdown: '# draft body',
              },
            ],
          };
        }
        if (cmd.input?.RequestItems) {
          batchCalls += 1;
          const table = Object.keys(cmd.input.RequestItems)[0]!;
          if (batchCalls === 1) {
            return {
              Responses: { [table]: [] },
              UnprocessedKeys: {
                [table]: {
                  Keys: [{ pk: `POST#${published.id}`, sk: 'PUBLISHED' }],
                },
              },
            };
          }
          return {
            Responses: { [table]: [postPublished(published)] },
          };
        }
        // Get META must not be used when snapshot arrives on retry.
        if (cmd.input?.Key?.sk === 'META') {
          return {
            Item: {
              ...postMeta(published),
              title: draftTitle,
            },
          };
        }
        return {};
      },
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const storage = memoryStorage();
    await rebuildPublishedSite({
      scope: {
        allPosts: false,
        postSlugs: new Set(['welcome']),
        slugsToRemove: new Set(),
        feeds: true,
        home: false,
        resume: false,
        touchedEntityTypes: new Set(),
      },
      storage,
    });

    expect(batchCalls).toBe(2);
    const html = await storage.read('blog/welcome/index.html');
    expect(html).toContain(published.title);
    expect(html).not.toContain(draftTitle);
    const postsJson = JSON.parse(
      (await storage.read('blog/posts.json')) ?? '{}',
    ) as { items: Array<{ title: string }> };
    expect(postsJson.items[0]?.title).toBe(published.title);
  });

  it('invalidates CloudFront before KVS sync so a sync failure still clears cache', async () => {
    const post = makePost('welcome', 1);
    const order: string[] = [];

    const { syncViewerRequestBlogSlugs } =
      await import('../src/viewer-request-slugs.js');
    vi.mocked(syncViewerRequestBlogSlugs).mockImplementation(async () => {
      order.push('kvs');
      throw new Error('forced KVS failure');
    });

    ddbSend.mockImplementation(
      async (cmd: {
        input?: {
          IndexName?: string;
          RequestItems?: Record<string, { Keys: Array<{ pk: string }> }>;
        };
      }) => {
        if (cmd.input?.IndexName === 'gsi1') {
          return { Items: [postMeta(post)] };
        }
        if (cmd.input?.RequestItems) {
          const table = Object.keys(cmd.input.RequestItems)[0]!;
          return { Responses: { [table]: [postPublished(post)] } };
        }
        return {};
      },
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const storage = memoryStorage();
    const origInvalidate = storage.invalidate.bind(storage);
    storage.invalidate = async (paths) => {
      order.push('invalidate');
      await origInvalidate(paths);
    };

    await expect(
      rebuildPublishedSite({
        scope: {
          allPosts: false,
          postSlugs: new Set(['welcome']),
          slugsToRemove: new Set(),
          feeds: true,
          home: false,
          resume: false,
          touchedEntityTypes: new Set(),
        },
        storage,
      }),
    ).rejects.toThrow('forced KVS failure');

    expect(order).toEqual(['invalidate', 'kvs']);
    expect(storage.invalidations[0]).toEqual(
      expect.arrayContaining(['/blog*', '/sitemap.xml', '/rss.xml']),
    );
  });

  it('skips META-only published rows when building feeds', async () => {
    const staleMeta = makePost('stale-only', 1);

    ddbSend.mockImplementation(
      async (cmd: {
        input?: {
          IndexName?: string;
          RequestItems?: Record<string, { Keys: Array<{ pk: string }> }>;
        };
      }) => {
        if (cmd.input?.IndexName === 'gsi1') {
          return { Items: [postMeta(staleMeta)] };
        }
        if (cmd.input?.RequestItems) {
          const table = Object.keys(cmd.input.RequestItems)[0]!;
          // BatchGet finds no PUBLISHED snapshot — do not synthesize from META.
          return { Responses: { [table]: [] } };
        }
        return {};
      },
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const storage = memoryStorage();
    await rebuildPublishedSite({
      scope: {
        allPosts: false,
        postSlugs: new Set(),
        slugsToRemove: new Set(),
        feeds: true,
        home: false,
        resume: false,
        touchedEntityTypes: new Set(),
      },
      storage,
    });

    const postsJson = JSON.parse(
      (await storage.read('blog/posts.json')) ?? '{}',
    ) as { items: unknown[] };
    const slugsJson = JSON.parse(
      (await storage.read('blog/slugs.json')) ?? '{}',
    ) as { slugs: unknown[] };
    expect(postsJson.items).toEqual([]);
    expect(slugsJson.slugs).toEqual([]);
  });
});
