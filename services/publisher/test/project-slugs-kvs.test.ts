import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@gagnechris/shared';
import { runPublishTargets } from '../src/publish-targets/orchestrator.js';
import { publishTargets } from '../src/publish-targets/registry.js';
import type {
  PublishedProjectsCatalog,
  RebuildSiteSources,
} from '../src/publish-targets/types.js';
import type { RebuildScope } from '../src/rebuild-scope.js';
import type { SiteStorage } from '../src/storage.js';

const SHELL =
  '<html><head><title>x</title></head><body><div id="root"></div></body></html>';

function project(over: Partial<Project> & Pick<Project, 'slug'>): Project {
  return {
    id: `01PROJECT${over.slug.toUpperCase().replace(/-/g, '')}`.padEnd(26, '0'),
    name: over.slug,
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
    updatedAt: '2026-10-02T00:00:00.000Z',
    version: 2,
    hasUnpublishedChanges: false,
    ...over,
  };
}

function memoryStorage(): SiteStorage {
  const objects = new Map<string, string>();
  return {
    readShell: async () => SHELL,
    read: async (key) => objects.get(key),
    async put(key, body) {
      const text = typeof body === 'string' ? body : '';
      if (objects.get(key) === text) return false;
      objects.set(key, text);
      return true;
    },
    delete: async (key) => objects.delete(key),
    list: async (prefix) =>
      [...objects.keys()].filter((k) => k.startsWith(prefix)),
    invalidate: async () => undefined,
  };
}

const projectScope = (): RebuildScope => ({
  allPosts: false,
  postSlugs: new Set(),
  slugsToRemove: new Set(),
  feeds: false,
  home: false,
  resume: false,
  projectIds: new Set(),
  touchedEntityTypes: new Set(['project']),
});

describe('project slug allowlist (local KVS file)', () => {
  let dir: string;
  let kvsFile: string;
  let storage: SiteStorage;

  beforeEach(async () => {
    storage = memoryStorage();
    dir = await mkdtemp(join(tmpdir(), 'kvs-'));
    kvsFile = join(dir, 'kvs.json');
    vi.stubEnv('CLOUDFRONT_DISTRIBUTION_ID', 'local');
    vi.stubEnv('LOCAL_KVS_FILE', kvsFile);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  const rebuild = (catalog: PublishedProjectsCatalog) => {
    const sources: RebuildSiteSources = {
      readGeneration: async () => 0,
      listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
      listPublishedProjects: async () => catalog,
      getPublishedResume: async () => ({ status: 'missing' }),
      getPublishedHome: async () => ({ status: 'missing' }),
    };
    return runPublishTargets({
      scope: projectScope(),
      storage,
      sources,
      targets: publishTargets,
    });
  };

  const keys = async () =>
    (JSON.parse(await readFile(kvsFile, 'utf8')) as { keys: string[] }).keys;

  it('lists projects with a page; href cards and body-less ideas have none', async () => {
    await rebuild({
      projects: [
        project({ slug: 'notebook' }),
        project({ slug: 'bears', href: '/dont-feed-the-bears' }),
        project({ slug: 'someday', stage: 'idea', bodyMarkdown: '' }),
      ],
      corruptSlugs: [],
    });
    expect(await keys()).toEqual(['projects/__synced__', 'projects/notebook']);
  });

  it('drops a project on unpublish and keeps the sentinel', async () => {
    await rebuild({
      projects: [project({ slug: 'notebook' })],
      corruptSlugs: [],
    });
    await rebuild({ projects: [], corruptSlugs: [] });
    expect(await keys()).toEqual(['projects/__synced__']);
  });

  it("keeps a corrupt row's live page reachable", async () => {
    await rebuild({
      projects: [project({ slug: 'notebook' })],
      corruptSlugs: [],
    });
    await rebuild({ projects: [], corruptSlugs: ['notebook'] });
    expect(await keys()).toEqual(['projects/__synced__', 'projects/notebook']);
  });
});
