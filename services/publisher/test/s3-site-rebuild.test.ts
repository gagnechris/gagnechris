import { access, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '@gagnechris/shared';
import type { SiteStorage } from '../src/storage.js';
import type { RebuildScope } from '../src/rebuild-scope.js';

const ddbSend = vi.fn();
const addMetric = vi.fn();
const loggerWarn = vi.fn();

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
  syncViewerRequestProjectSlugs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/observability.js', () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarn(...args),
    info: vi.fn(),
    error: vi.fn(),
    addContext: vi.fn(),
  },
  metrics: {
    addMetric: (...args: unknown[]) => addMetric(...args),
    clearMetrics: vi.fn(),
    publishStoredMetrics: vi.fn(),
  },
}));

vi.mock('../src/resume-pdf.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/resume-pdf.js')>();
  return {
    ...actual,
    renderResumePdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50])),
  };
});

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

function postPublished(post: Post, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function postMeta(post: Post, overrides: Record<string, unknown> = {}) {
  return {
    ...postPublished(post),
    sk: 'META',
    gsi1pk: 'STATUS#published',
    ...overrides,
  };
}

function memoryStorage(): SiteStorage & {
  puts: string[];
  deletes: string[];
  invalidations: string[][];
  objects: Map<string, string>;
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
    objects,
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

const feedsScope = (): RebuildScope => ({
  allPosts: true,
  postSlugs: new Set(),
  slugsToRemove: new Set(),
  feeds: true,
  home: false,
  resume: false,
  touchedEntityTypes: new Set(),
});

describe('publisher corrupt / GSI / quiet rebuild', () => {
  const prevTable = process.env.DATA_TABLE_NAME;

  beforeEach(async () => {
    process.env.DATA_TABLE_NAME = 'test-table';
    ddbSend.mockReset();
    addMetric.mockReset();
    loggerWarn.mockReset();
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

  it('keeps corrupt slugs in KVS, slugs.json, and sitemap; HTML still serves', async () => {
    const good = makePost('first-post', '01GOOD00000000000000000000');
    const corrupt = makePost('keep-me', '01CORRUPT00000000000000000');

    ddbSend.mockImplementation(
      async (cmd: {
        input?: {
          IndexName?: string;
          RequestItems?: Record<
            string,
            { Keys: Array<{ pk: string }>; ConsistentRead?: boolean }
          >;
        };
      }) => {
        if (cmd.input?.IndexName === 'gsi1') {
          return { Items: [postMeta(good), postMeta(corrupt)] };
        }
        if (cmd.input?.RequestItems) {
          const table = Object.keys(cmd.input.RequestItems)[0]!;
          const cfg = cmd.input.RequestItems[table]!;
          expect(cfg.ConsistentRead).toBe(true);
          return {
            Responses: {
              [table]: [
                postPublished(good),
                // Missing required title → zod parse failure (real parse path).
                {
                  pk: `POST#${corrupt.id}`,
                  sk: 'PUBLISHED',
                  entityType: 'post',
                  postId: corrupt.id,
                  slug: corrupt.slug,
                  status: 'published',
                  publishedAt: corrupt.publishedAt,
                  updatedAt: corrupt.updatedAt,
                  version: 1,
                },
              ],
            },
          };
        }
        return {};
      },
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const { syncViewerRequestBlogSlugs } =
      await import('../src/viewer-request-slugs.js');

    const storage = memoryStorage();
    await mkdir(join(tmpdir(), 'unused'), { recursive: true }).catch(() => {});
    storage.objects.set(
      `blog/${corrupt.slug}/index.html`,
      '<html>live corrupt post</html>',
    );

    await rebuildPublishedSite({ scope: feedsScope(), storage });

    expect(addMetric).toHaveBeenCalledWith(
      'DataIntegrityError',
      expect.anything(),
      1,
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('corrupt published post'),
      expect.objectContaining({
        pk: `POST#${corrupt.id}`,
        sk: 'PUBLISHED',
      }),
    );

    const slugsJson = JSON.parse(
      (await storage.read('blog/slugs.json')) ?? '{}',
    ) as { slugs: string[] };
    expect(slugsJson.slugs).toEqual(
      expect.arrayContaining([good.slug, corrupt.slug]),
    );

    const sitemap = (await storage.read('sitemap.xml')) ?? '';
    expect(sitemap).toContain(`/posts/${corrupt.slug}`);

    expect(syncViewerRequestBlogSlugs).toHaveBeenCalledOnce();
    const desired = vi.mocked(syncViewerRequestBlogSlugs).mock.calls[0]![0];
    expect(desired).toEqual(expect.arrayContaining([good.slug, corrupt.slug]));

    // HTML preserved (not orphan-deleted) and allowlisted.
    expect(await storage.read(`blog/${corrupt.slug}/index.html`)).toContain(
      'live corrupt post',
    );
    expect(storage.deletes).not.toContain(`blog/${corrupt.slug}/index.html`);

    // listPublishedPosts called once (catalog only; KVS uses in-memory union).
    const gsiCalls = ddbSend.mock.calls.filter(
      (call) =>
        call[0] &&
        typeof call[0] === 'object' &&
        'input' in call[0] &&
        (
          call[0] as {
            input?: {
              IndexName?: string;
              ExpressionAttributeValues?: Record<string, unknown>;
            };
          }
        ).input?.ExpressionAttributeValues?.[':pk'] === 'STATUS#published',
    );
    expect(gsiCalls).toHaveLength(1);
  });

  it('renders a just-published post missing from GSI via stream NewImage', async () => {
    const existing = makePost('already-live', '01EXIST000000000000000000');
    const fresh = makePost('just-published', '01FRESH000000000000000000');

    ddbSend.mockImplementation(
      async (cmd: {
        input?: {
          IndexName?: string;
          RequestItems?: Record<string, { Keys: Array<{ pk: string }> }>;
        };
      }) => {
        if (cmd.input?.IndexName === 'gsi1') {
          // GSI lag: only the older post is visible.
          return { Items: [postMeta(existing)] };
        }
        if (cmd.input?.RequestItems) {
          const table = Object.keys(cmd.input.RequestItems)[0]!;
          return { Responses: { [table]: [postPublished(existing)] } };
        }
        return {};
      },
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const { syncViewerRequestBlogSlugs } =
      await import('../src/viewer-request-slugs.js');
    const storage = memoryStorage();

    await rebuildPublishedSite({
      scope: {
        allPosts: false,
        postSlugs: new Set([fresh.slug]),
        slugsToRemove: new Set(),
        feeds: true,
        home: false,
        resume: false,
        touchedEntityTypes: new Set(),
      },
      storage,
      streamPublishedPosts: [postPublished(fresh)],
    });

    expect(await storage.read(`blog/${fresh.slug}/index.html`)).toContain(
      fresh.title,
    );
    const slugsJson = JSON.parse(
      (await storage.read('blog/slugs.json')) ?? '{}',
    ) as { slugs: string[] };
    expect(slugsJson.slugs).toEqual(
      expect.arrayContaining([existing.slug, fresh.slug]),
    );
    const desired = vi.mocked(syncViewerRequestBlogSlugs).mock.calls[0]![0];
    expect(desired).toEqual(
      expect.arrayContaining([existing.slug, fresh.slug]),
    );
  });

  it('does not protect a draft META rename when PUBLISHED slug is corrupt', async () => {
    const postId = '01RENAME00000000000000000';
    const liveSlug = 'old-live-slug';

    ddbSend.mockImplementation(
      async (cmd: {
        input?: {
          IndexName?: string;
          RequestItems?: Record<string, { Keys: Array<{ pk: string }> }>;
        };
      }) => {
        if (cmd.input?.IndexName === 'gsi1') {
          return {
            Items: [
              {
                pk: `POST#${postId}`,
                sk: 'META',
                gsi1pk: 'STATUS#published',
                entityType: 'post',
                postId,
                // Draft rename already on META — must not become corruptSlugs.
                slug: 'pending-rename',
                title: 'T',
                excerpt: '',
                bodyMarkdown: '',
                tags: [],
                status: 'published',
                publishedAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                version: 2,
              },
            ],
          };
        }
        if (cmd.input?.RequestItems) {
          const table = Object.keys(cmd.input.RequestItems)[0]!;
          return {
            Responses: {
              [table]: [
                {
                  pk: `POST#${postId}`,
                  sk: 'PUBLISHED',
                  entityType: 'post',
                  postId,
                  // Corrupt slug field (empty) — do not fall back to META.
                  slug: '',
                  status: 'published',
                  publishedAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                  version: 1,
                },
              ],
            },
          };
        }
        return {};
      },
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const { syncViewerRequestBlogSlugs } =
      await import('../src/viewer-request-slugs.js');
    const storage = memoryStorage();
    storage.objects.set(`blog/${liveSlug}/index.html`, '<html>old live</html>');
    storage.objects.set(
      'blog/posts.json',
      JSON.stringify({
        items: [
          {
            id: postId,
            slug: liveSlug,
            title: 'Old live title',
            excerpt: 'old excerpt',
            publishedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            tags: [],
            coverImage: null,
          },
        ],
      }),
    );

    await rebuildPublishedSite({ scope: feedsScope(), storage });

    const desired = vi.mocked(syncViewerRequestBlogSlugs).mock.calls[0]![0] as
      string[] | (() => Promise<string[]>);
    const slugs = typeof desired === 'function' ? await desired() : desired;
    expect(slugs).not.toContain('pending-rename');

    // The last published slug (from posts.json) keeps its live page, KVS
    // entry, and feed entries.
    expect(slugs).toContain(liveSlug);
    expect(storage.deletes).not.toContain(`blog/${liveSlug}/index.html`);
    expect(await storage.read(`blog/${liveSlug}/index.html`)).toBe(
      '<html>old live</html>',
    );
    const postsJson = JSON.parse(
      (await storage.read('blog/posts.json')) ?? '{}',
    ) as { items: Array<{ id: string; slug: string }> };
    expect(postsJson.items).toEqual([
      expect.objectContaining({ id: postId, slug: liveSlug }),
    ]);
    expect(await storage.read('rss.xml')).toContain(`/posts/${liveSlug}`);
    expect(await storage.read('blog/index.html')).toContain('Old live title');
  });

  it('corrupt post keeps its previous rss, posts.json, and index entries', async () => {
    const good = makePost('fine-post', '01FINE00000000000000000000');
    const corrupt = makePost('keep-in-feeds', '01FEEDS0000000000000000000');
    corrupt.publishedAt = '2026-02-01T00:00:00.000Z';

    ddbSend.mockImplementation(
      async (cmd: {
        input?: {
          IndexName?: string;
          RequestItems?: Record<string, unknown>;
        };
      }) => {
        if (cmd.input?.IndexName === 'gsi1') {
          return { Items: [postMeta(good), postMeta(corrupt)] };
        }
        if (cmd.input?.RequestItems) {
          const table = Object.keys(cmd.input.RequestItems)[0]!;
          return {
            Responses: {
              [table]: [
                postPublished(good),
                // Missing title → corrupt.
                postPublished(corrupt, { title: undefined }),
              ],
            },
          };
        }
        return {};
      },
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const storage = memoryStorage();
    storage.objects.set(`blog/${corrupt.slug}/index.html`, '<html>live</html>');
    storage.objects.set(
      'blog/posts.json',
      JSON.stringify({
        items: [
          {
            id: corrupt.id,
            slug: corrupt.slug,
            title: 'Previously Published Title',
            excerpt: 'prev',
            publishedAt: corrupt.publishedAt,
            updatedAt: corrupt.updatedAt,
            tags: [],
            coverImage: null,
          },
        ],
      }),
    );

    await rebuildPublishedSite({ scope: feedsScope(), storage });

    const postsJson = JSON.parse(
      (await storage.read('blog/posts.json')) ?? '{}',
    ) as { items: Array<{ slug: string; title: string }> };
    // Newest first: the retained corrupt entry sorts by its publishedAt.
    expect(postsJson.items.map((i) => i.slug)).toEqual([
      corrupt.slug,
      good.slug,
    ]);
    expect(postsJson.items[0]!.title).toBe('Previously Published Title');
    const rss = (await storage.read('rss.xml')) ?? '';
    expect(rss).toContain(`/posts/${corrupt.slug}`);
    expect(rss).toContain('Previously Published Title');
    expect(await storage.read('blog/index.html')).toContain(
      'Previously Published Title',
    );
    // The page itself is not re-rendered from the feed entry.
    expect(await storage.read(`blog/${corrupt.slug}/index.html`)).toBe(
      '<html>live</html>',
    );
  });

  it('getPublishedResume: corrupt row is corrupt (not missing), ConsistentRead', async () => {
    ddbSend.mockResolvedValue({
      Item: {
        pk: 'RESUME',
        sk: 'PUBLISHED',
        entityType: 'resume',
        status: 'published',
        // Missing name / content → schema failure.
      },
    });
    const { getPublishedResume } = await import('../src/s3-site.js');

    await expect(getPublishedResume('test-table')).resolves.toEqual({
      status: 'corrupt',
    });
    expect(addMetric).toHaveBeenCalledWith(
      'DataIntegrityError',
      expect.anything(),
      1,
    );
    const get = ddbSend.mock.calls[0]![0] as {
      input: { ConsistentRead?: boolean };
    };
    expect(get.input.ConsistentRead).toBe(true);
  });

  it('getPublishedHome: corrupt row is corrupt (not missing), ConsistentRead', async () => {
    ddbSend.mockResolvedValue({
      Item: {
        pk: 'HOME',
        sk: 'PUBLISHED',
        entityType: 'home',
        status: 'published',
        // Missing name / title / about → schema failure.
      },
    });
    const { getPublishedHome } = await import('../src/s3-site.js');

    await expect(getPublishedHome('test-table')).resolves.toEqual({
      status: 'corrupt',
    });
    expect(addMetric).toHaveBeenCalledWith(
      'DataIntegrityError',
      expect.anything(),
      1,
    );
    const get = ddbSend.mock.calls[0]![0] as {
      input: { ConsistentRead?: boolean };
    };
    expect(get.input.ConsistentRead).toBe(true);
  });

  it('quiet full rebuild: missing resume.pdf delete is not a change', async () => {
    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const storage = memoryStorage();

    // First rebuild: writes unavailable resume page; PDF already absent.
    const first = await rebuildPublishedSite({
      storage,
      sources: {
        listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
        listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
        getPublishedResume: async () => ({ status: 'missing' }),
        getPublishedHome: async () => ({ status: 'missing' }),
      },
    });
    expect(first.resumeUnpublished).toBe(true);
    // First run may invalidate because unavailable HTML is new.
    expect(first.invalidated.length).toBeGreaterThan(0);

    storage.puts.length = 0;
    storage.deletes.length = 0;
    storage.invalidations.length = 0;

    const second = await rebuildPublishedSite({
      storage,
      sources: {
        listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
        listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
        getPublishedResume: async () => ({ status: 'missing' }),
        getPublishedHome: async () => ({ status: 'missing' }),
      },
    });

    expect(storage.deletes).toEqual([]);
    expect(second.invalidated).toEqual([]);
    expect(storage.invalidations).toEqual([[]]);
  });

  it('filesystem: corrupt post stays allowlisted after full rebuild', async () => {
    const root = await mkdtemp(join(tmpdir(), 'publisher-chr167-'));
    const SHELL =
      '<!DOCTYPE html><html><head><title>Shell</title><meta name="description" content="d" /><meta property="og:title" content="t" /><meta property="og:description" content="d" /><meta property="og:type" content="website" /><meta property="og:url" content="https://gagnechris.com/" /><meta property="og:image" content="https://gagnechris.com/og-image.jpg" /><meta name="twitter:title" content="t" /><meta name="twitter:description" content="d" /><meta name="twitter:image" content="https://gagnechris.com/og-image.jpg" /><link rel="canonical" href="https://gagnechris.com/" /></head><body><div id="root"></div></body></html>';
    await writeFile(join(root, '_shell.html'), SHELL);
    await writeFile(join(root, 'index.html'), SHELL);
    await mkdir(join(root, 'blog', 'keep-me'), { recursive: true });
    await writeFile(
      join(root, 'blog', 'keep-me', 'index.html'),
      '<html>live</html>',
    );

    const { rebuildPublishedSite } = await import('../src/s3-site.js');
    const { createFilesystemSiteStorage } =
      await import('../src/storage-fs.js');
    const storage = createFilesystemSiteStorage(root);

    await rebuildPublishedSite({
      storage,
      sources: {
        listPublishedPosts: async () => ({
          posts: [],
          corruptSlugs: ['keep-me'],
        }),
        listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
        getPublishedResume: async () => ({ status: 'missing' }),
        getPublishedHome: async () => ({ status: 'missing' }),
      },
    });

    await access(join(root, 'blog', 'keep-me', 'index.html'));
    const slugsJson = JSON.parse(
      await readFile(join(root, 'blog', 'slugs.json'), 'utf-8'),
    ) as { slugs: string[] };
    expect(slugsJson.slugs).toContain('keep-me');
    const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf-8');
    expect(sitemap).toContain('/posts/keep-me');
  });
});
