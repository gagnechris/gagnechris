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

vi.mock('../src/resume-pdf-publish.js', () => ({
  publishResumePdf: vi.fn().mockResolvedValue({ status: 'written' }),
}));

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

function memoryStorage(): SiteStorage & { puts: string[]; deletes: string[] } {
  const shell =
    '<html><head></head><body><div id="root"></div></body></html>';
  const objects = new Map<string, string>();
  objects.set('_shell.html', shell);
  objects.set('index.html', shell);
  const puts: string[] = [];
  const deletes: string[] = [];
  return {
    puts,
    deletes,
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
      objects.delete(key);
      deletes.push(key);
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix));
    },
    async invalidate() {},
  };
}

describe('rebuildPublishedSite selective scope', () => {
  const prevTable = process.env.DATA_TABLE_NAME;

  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'test-table';
    ddbSend.mockReset();
  });

  afterEach(() => {
    if (prevTable === undefined) delete process.env.DATA_TABLE_NAME;
    else process.env.DATA_TABLE_NAME = prevTable;
    vi.resetModules();
  });

  it('home-only scope does not put post pages, feeds, or resume', async () => {
    ddbSend.mockImplementation(async (cmd: { input?: { Key?: { pk?: string } } }) => {
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
    });

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const { publishResumePdf } = await import('../src/resume-pdf-publish.js');
    const { syncViewerRequestBlogSlugs } = await import(
      '../src/viewer-request-slugs.js'
    );

    const storage = memoryStorage();
    const scope: RebuildScope = {
      allPosts: false,
      postSlugs: new Set(),
      slugsToRemove: new Set(),
      feeds: false,
      home: true,
      resume: false,
    };

    const result = await rebuildPublishedSite({ scope, storage });

    expect(storage.puts).toEqual(['index.html', 'home/last-published.json']);
    expect(storage.deletes).toEqual([]);
    expect(result.homePublished).toBe(true);
    expect(result.homeRestoredFromSnapshot).toBe(false);
    expect(result.resumePublished).toBe(false);
    expect(result.resumeUnpublished).toBe(false);
    expect(result.invalidated.sort()).toEqual(['/', '/index.html']);
    expect(publishResumePdf).not.toHaveBeenCalled();
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
    const { publishResumePdf } = await import('../src/resume-pdf-publish.js');
    const { syncViewerRequestBlogSlugs } = await import(
      '../src/viewer-request-slugs.js'
    );

    const storage = memoryStorage();
    const scope: RebuildScope = {
      allPosts: false,
      postSlugs: new Set(['post-7']),
      slugsToRemove: new Set(),
      feeds: true,
      home: false,
      resume: false,
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
    expect(publishResumePdf).not.toHaveBeenCalled();
    expect(syncViewerRequestBlogSlugs).toHaveBeenCalledOnce();
  });
});
