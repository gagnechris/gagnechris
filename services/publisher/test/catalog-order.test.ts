import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMetaItem,
  buildProjectMetaItem,
  buildProjectPublishedItem,
  buildPublishedItem,
} from '@gagnechris/data';
import type { Post, Project } from '@gagnechris/shared';
import type { RebuildScope } from '../src/rebuild-scope.js';
import type { SiteStorage } from '../src/storage.js';

const ddbSend = vi.fn();
const loggerInfo = vi.fn();
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

vi.mock('../src/viewer-request-slugs.js', () => ({
  syncViewerRequestBlogSlugs: vi.fn().mockResolvedValue(undefined),
  syncViewerRequestProjectSlugs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/observability.js', () => ({
  logger: {
    warn: vi.fn(),
    info: (...args: unknown[]) => loggerInfo(...args),
    error: vi.fn(),
    addContext: vi.fn(),
  },
  metrics: {
    addMetric: (...args: unknown[]) => addMetric(...args),
    clearMetrics: vi.fn(),
    publishStoredMetrics: vi.fn(),
  },
}));

const AT = '2026-10-01T00:00:00.000Z';

const post = (slug: string): Post => ({
  id: `01POST${slug.toUpperCase()}`.padEnd(26, '0'),
  slug,
  title: `Post ${slug}`,
  excerpt: '',
  bodyMarkdown: 'Body.',
  tags: [],
  projectIds: [],
  status: 'published',
  publishedAt: AT,
  updatedAt: AT,
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
});

const project = (slug: string, order: number): Project => ({
  id: `01PROJECT${slug.toUpperCase()}`.padEnd(26, '0'),
  slug,
  name: `Project ${slug}`,
  pitch: '',
  stage: 'building',
  stageNote: '',
  previewImage: null,
  bodyMarkdown: 'Body.',
  stack: [],
  links: [],
  demo: null,
  order,
  href: null,
  status: 'published',
  publishedAt: AT,
  updatedAt: AT,
  version: 1,
  hasUnpublishedChanges: false,
});

function memoryStorage(): SiteStorage & { objects: Map<string, string> } {
  const shell = '<html><head></head><body><div id="root"></div></body></html>';
  const objects = new Map<string, string>();
  return {
    objects,
    async readShell() {
      return shell;
    },
    async read(key) {
      return objects.get(key);
    },
    async put(key, body) {
      const text =
        typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
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

type Command = {
  input?: { IndexName?: string; RequestItems?: Record<string, unknown> };
};

/** BatchGet answers in a different order on every call, as DynamoDB may. */
function shuffledTable(opts: {
  metas: Record<string, unknown>[];
  published: Record<string, unknown>[];
}) {
  let batchGets = 0;
  ddbSend.mockImplementation(async (cmd: Command) => {
    if (cmd.input?.IndexName) return { Items: opts.metas };
    if (cmd.input?.RequestItems) {
      const table = Object.keys(cmd.input.RequestItems)[0]!;
      batchGets += 1;
      const rows =
        batchGets % 2 === 0 ? [...opts.published].reverse() : opts.published;
      return { Responses: { [table]: rows } };
    }
    return {};
  });
  return { batchGets: () => batchGets };
}

const scope = (overrides: Partial<RebuildScope>): RebuildScope => ({
  allPosts: false,
  postSlugs: new Set(),
  slugsToRemove: new Set(),
  feeds: false,
  home: false,
  resume: false,
  projectIds: new Set(),
  touchedEntityTypes: new Set(),
  ...overrides,
});

const rebuildPasses = () =>
  loggerInfo.mock.calls.filter((call) =>
    String(call[0]).includes('changed during the rebuild'),
  ).length + 1;

describe('published catalog order', () => {
  const prevTable = process.env.DATA_TABLE_NAME;

  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'test-table';
    ddbSend.mockReset();
    loggerInfo.mockReset();
    addMetric.mockReset();
  });

  afterEach(() => {
    if (prevTable === undefined) delete process.env.DATA_TABLE_NAME;
    else process.env.DATA_TABLE_NAME = prevTable;
    vi.resetModules();
  });

  it('projects in any BatchGet order rebuild in one pass, sorted by order, name, then id', async () => {
    const projects = [
      project('zeta', 0),
      project('alpha', 1),
      project('beta', 1),
      {
        ...project('twin', 1),
        id: '01PROJECTTWIN0000000000002',
        name: 'Project beta',
      },
    ];
    const table = shuffledTable({
      metas: projects.map(buildProjectMetaItem),
      published: projects.map(buildProjectPublishedItem),
    });
    const { listPublishedProjects, rebuildPublishedSite } =
      await import('../src/s3-site.js');

    const first = await listPublishedProjects('test-table');
    const second = await listPublishedProjects('test-table');
    expect(first.projects.map((p) => p.id)).toEqual(
      second.projects.map((p) => p.id),
    );
    expect(first.projects.map((p) => p.slug)).toEqual([
      'zeta',
      'alpha',
      'beta',
      'twin',
    ]);

    loggerInfo.mockReset();
    const before = table.batchGets();
    await rebuildPublishedSite({
      scope: scope({
        projectIds: new Set([projects[0]!.id]),
        touchedEntityTypes: new Set(['project']),
        home: true,
      }),
      storage: memoryStorage(),
    });
    expect(rebuildPasses()).toBe(1);
    expect(table.batchGets() - before).toBe(2);
    expect(addMetric).not.toHaveBeenCalledWith(
      'RebuildUnsettled',
      expect.anything(),
      expect.anything(),
    );
  });

  it('posts published at the same instant are ordered by id and rebuild in one pass', async () => {
    const posts = [post('one'), post('two'), post('three')];
    const table = shuffledTable({
      metas: posts.map(buildMetaItem),
      published: posts.map((p) => buildPublishedItem(p)),
    });
    const { listPublishedPosts, rebuildPublishedSite } =
      await import('../src/s3-site.js');

    const first = await listPublishedPosts('test-table');
    const second = await listPublishedPosts('test-table');
    expect(first.posts.map((p) => p.id)).toEqual(second.posts.map((p) => p.id));
    expect(first.posts.map((p) => p.id)).toEqual(posts.map((p) => p.id).sort());

    loggerInfo.mockReset();
    const before = table.batchGets();
    await rebuildPublishedSite({
      scope: scope({ allPosts: true, feeds: true }),
      storage: memoryStorage(),
    });
    expect(rebuildPasses()).toBe(1);
    expect(table.batchGets() - before).toBe(2);
  });
});
