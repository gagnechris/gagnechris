import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AttributeValue,
  Context,
  DynamoDBRecord,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { Post } from '@gagnechris/shared';
import type { SiteStorage } from '../src/storage.js';

const ddbSend = vi.fn();
const syncSlugs = vi.fn();

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

vi.mock('../src/viewer-request-slugs.js', () => ({
  KvsSyncError: class KvsSyncError extends Error {},
  syncViewerRequestBlogSlugs: (...args: unknown[]) => syncSlugs(...args),
}));

vi.mock('../src/observability.js', () => ({
  logger: {
    addContext: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  metrics: {
    clearMetrics: vi.fn(),
    addMetric: vi.fn(),
    publishStoredMetrics: vi.fn(),
  },
}));

function makePost(slug: string, id: string): Post {
  return {
    id,
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

function image(item: Record<string, unknown>): Record<string, AttributeValue> {
  return marshall(item, { removeUndefinedValues: true }) as Record<
    string,
    AttributeValue
  >;
}

function keysOf(post: Post): Record<string, AttributeValue> {
  return image({ pk: `POST#${post.id}`, sk: 'PUBLISHED' });
}

function insert(post: Post, id: string): DynamoDBRecord {
  return {
    eventID: id,
    eventName: 'INSERT',
    eventSource: 'aws:dynamodb',
    dynamodb: { Keys: keysOf(post), NewImage: image(postPublished(post)) },
  };
}

function remove(post: Post, id: string): DynamoDBRecord {
  return {
    eventID: id,
    eventName: 'REMOVE',
    eventSource: 'aws:dynamodb',
    dynamodb: { Keys: keysOf(post), OldImage: image(postPublished(post)) },
  };
}

/** GSI1 + BatchGet backed by a fixed list of PUBLISHED rows the GSI can see. */
function mockCatalog(visible: Post[]): void {
  ddbSend.mockImplementation(
    async (cmd: {
      input?: { IndexName?: string; RequestItems?: Record<string, unknown> };
    }) => {
      if (cmd.input?.IndexName === 'gsi1') {
        return {
          Items: visible.map((p) => ({
            ...postPublished(p),
            sk: 'META',
            gsi1pk: 'STATUS#published',
          })),
        };
      }
      if (cmd.input?.RequestItems) {
        const table = Object.keys(cmd.input.RequestItems)[0]!;
        return { Responses: { [table]: visible.map(postPublished) } };
      }
      return {};
    },
  );
}

function memoryStorage(): SiteStorage & { objects: Map<string, string> } {
  const shell = '<html><head></head><body><div id="root"></div></body></html>';
  const objects = new Map<string, string>([['_shell.html', shell]]);
  return {
    objects,
    async readShell() {
      return shell;
    },
    async read(key) {
      return objects.get(key);
    },
    async put(key, body) {
      const next =
        typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
      if (objects.get(key) === next) return false;
      objects.set(key, next);
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

const fakeContext = { awsRequestId: 'test' } as Context;

async function runHandler(storage: SiteStorage, records: DynamoDBRecord[]) {
  const { setSiteStorage } = await import('../src/s3-site.js');
  const { handler } = await import('../src/handler.js');
  setSiteStorage(storage);
  const event: DynamoDBStreamEvent = { Records: records };
  return handler(event, fakeContext);
}

function postsJsonSlugs(storage: { objects: Map<string, string> }): string[] {
  const raw = storage.objects.get('blog/posts.json') ?? '{"items":[]}';
  return (JSON.parse(raw) as { items: Array<{ slug: string }> }).items.map(
    (i) => i.slug,
  );
}

function kvsSlugs(): string[] {
  expect(syncSlugs).toHaveBeenCalledOnce();
  return syncSlugs.mock.calls[0]![0] as string[];
}

describe('publisher handler stream batches', () => {
  const prevTable = process.env.DATA_TABLE_NAME;

  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'test-table';
    ddbSend.mockReset();
    syncSlugs.mockReset();
    syncSlugs.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { setSiteStorage } = await import('../src/s3-site.js');
    setSiteStorage(undefined);
    if (prevTable === undefined) delete process.env.DATA_TABLE_NAME;
    else process.env.DATA_TABLE_NAME = prevTable;
  });

  it('publish then unpublish in one batch leaves the post unpublished', async () => {
    const live = makePost('already-live', '01LIVE0000000000000000000');
    const oops = makePost('published-by-mistake', '01OOPS0000000000000000000');
    // GSI / BatchGet already reflect the unpublish (no PUBLISHED row for oops).
    mockCatalog([live]);
    const storage = memoryStorage();

    await runHandler(storage, [insert(oops, '1'), remove(oops, '2')]);

    expect(storage.objects.has(`blog/${oops.slug}/index.html`)).toBe(false);
    expect(postsJsonSlugs(storage)).toEqual([live.slug]);
    expect(storage.objects.get('rss.xml')).not.toContain(oops.slug);
    expect(kvsSlugs()).not.toContain(oops.slug);
  });

  it('unpublish then republish in one batch keeps the post live', async () => {
    const post = makePost('back-again', '01BACK0000000000000000000');
    // GSI lag: the republished post is not visible yet.
    mockCatalog([]);
    const storage = memoryStorage();

    await runHandler(storage, [remove(post, '1'), insert(post, '2')]);

    expect(storage.objects.get(`blog/${post.slug}/index.html`)).toContain(
      post.title,
    );
    expect(kvsSlugs()).toContain(post.slug);
  });

  it('handler merges the stream NewImage when GSI1 lags', async () => {
    const fresh = makePost('just-published', '01FRESH000000000000000000');
    mockCatalog([]);
    const storage = memoryStorage();

    const result = await runHandler(storage, [insert(fresh, '1')]);

    expect(result.publishedCount).toBe(1);
    expect(storage.objects.get(`blog/${fresh.slug}/index.html`)).toContain(
      fresh.title,
    );
    expect(postsJsonSlugs(storage)).toEqual([fresh.slug]);
    expect(kvsSlugs()).toContain(fresh.slug);
  });

  it('GSI lag past the publishing batch keeps the post in KVS and feeds', async () => {
    const lagging = makePost('still-lagging', '01LAG00000000000000000000');
    const other = makePost('other-post', '01OTHER000000000000000000');
    const storage = memoryStorage();

    // Batch 1 publishes `lagging` while the GSI cannot see it yet.
    mockCatalog([]);
    await runHandler(storage, [insert(lagging, '1')]);
    expect(storage.objects.has(`blog/${lagging.slug}/index.html`)).toBe(true);

    // Batch 2 publishes another post; the GSI still lags on `lagging`.
    syncSlugs.mockClear();
    mockCatalog([other]);
    await runHandler(storage, [insert(other, '2')]);

    expect(storage.objects.has(`blog/${lagging.slug}/index.html`)).toBe(true);
    expect(kvsSlugs()).toEqual(
      expect.arrayContaining([lagging.slug, other.slug]),
    );
    expect(postsJsonSlugs(storage)).toEqual(
      expect.arrayContaining([lagging.slug, other.slug]),
    );

    // Batch 3 unpublishes it: the retained entry must not outlive the page.
    syncSlugs.mockClear();
    mockCatalog([other]);
    await runHandler(storage, [remove(lagging, '3')]);

    expect(storage.objects.has(`blog/${lagging.slug}/index.html`)).toBe(false);
    expect(kvsSlugs()).not.toContain(lagging.slug);
    expect(postsJsonSlugs(storage)).toEqual([other.slug]);
  });
});
