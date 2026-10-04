import { describe, expect, it, vi } from 'vitest';
import type { AttributeValue, DynamoDBRecord } from 'aws-lambda';
import { DEFAULT_HOME, type Home, type Post } from '@gagnechris/shared';
import {
  HOME_LAST_PUBLISHED_KEY,
  homeToSnapshot,
} from '../src/home-publish.js';
import { runPublishTargets } from '../src/publish-targets/orchestrator.js';
import type {
  PublishedLookup,
  RebuildSiteSources,
} from '../src/publish-targets/types.js';
import { collectRebuildScope } from '../src/rebuild-scope.js';
import type { SiteStorage } from '../src/storage.js';

vi.mock('../src/viewer-request-slugs.js', () => ({
  syncViewerRequestBlogSlugs: vi.fn().mockResolvedValue(undefined),
  syncViewerRequestProjectSlugs: vi.fn().mockResolvedValue(undefined),
}));

const SHELL = '<html><head></head><body><div id="root"></div></body></html>';

const HOME: Home = {
  ...DEFAULT_HOME,
  name: 'Published Name',
  title: 'Published title line',
  about: 'Published about.',
  status: 'published',
  publishedAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  version: 4,
};

const post = (n: number, overrides: Partial<Post> = {}): Post => ({
  id: `0${n}`,
  slug: `post-${n}`,
  title: `Post number ${n}`,
  excerpt: `Excerpt ${n}.`,
  bodyMarkdown: `Body ${n}.`,
  tags: [],
  status: 'published',
  publishedAt: `2026-0${n}-01T00:00:00.000Z`,
  updatedAt: `2026-0${n}-01T00:00:00.000Z`,
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
  ...overrides,
});

const newestFirst = (posts: Post[]) =>
  [...posts].sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  );

function publishedImage(
  p: Post,
  status = 'published',
): Record<string, AttributeValue> {
  return {
    pk: { S: `POST#${p.id}` },
    sk: { S: 'PUBLISHED' },
    entityType: { S: 'post' },
    postId: { S: p.id },
    slug: { S: p.slug },
    status: { S: status },
  };
}

const record = (
  eventName: DynamoDBRecord['eventName'],
  images: {
    OldImage?: Record<string, AttributeValue>;
    NewImage?: Record<string, AttributeValue>;
  },
): DynamoDBRecord => ({
  eventID: '1',
  eventName,
  eventSource: 'aws:dynamodb',
  dynamodb: images,
});

function memoryStorage(seed: Record<string, string> = {}) {
  const objects = new Map<string, string>([
    ['_shell.html', SHELL],
    ['index.html', SHELL],
    ...Object.entries(seed),
  ]);
  const puts: string[] = [];
  const invalidations: string[][] = [];
  const storage: SiteStorage = {
    async readShell() {
      return objects.get('_shell.html')!;
    },
    async read(key) {
      return objects.get(key);
    },
    async put(key, body) {
      const next =
        typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
      if (objects.get(key) === next) return false;
      objects.set(key, next);
      puts.push(key);
      return true;
    },
    async delete(key) {
      return objects.delete(key);
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix));
    },
    async invalidate(paths) {
      if (paths.length) invalidations.push([...paths]);
    },
  };
  return {
    storage,
    puts,
    invalidations,
    home: () => objects.get('index.html') ?? '',
    reset() {
      puts.length = 0;
      invalidations.length = 0;
    },
  };
}

function sources(
  getPosts: () => Post[],
  home: () => PublishedLookup<Home> = () => ({ status: 'ok', entity: HOME }),
) {
  const getPublishedHome = vi.fn(async () => home());
  const src: RebuildSiteSources = {
    listPublishedPosts: async () => ({
      posts: newestFirst(getPosts()),
      corruptSlugs: [],
    }),
    listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
    getPublishedResume: async () => ({ status: 'missing' }),
    getPublishedHome,
  };
  return { src, getPublishedHome };
}

const homeScope = () =>
  collectRebuildScope([
    record('MODIFY', {
      NewImage: {
        pk: { S: 'HOME#current' },
        sk: { S: 'PUBLISHED' },
        entityType: { S: 'home' },
        status: { S: 'published' },
      },
    }),
  ]);

const recentSlugs = (html: string) =>
  [
    ...html.matchAll(/class="home-post__title"><a href="\/posts\/([^"]+)"/g),
  ].map((m) => m[1]);

/** A site where Home and posts 1–3 were already published together. */
async function seededSite(posts: Post[], home?: () => PublishedLookup<Home>) {
  const site = memoryStorage();
  const live = { posts };
  const { src, getPublishedHome } = sources(() => live.posts, home);
  await runPublishTargets({
    scope: homeScope(),
    storage: site.storage,
    sources: src,
  });
  site.reset();
  return { site, live, src, getPublishedHome };
}

describe('Home Recent posts follow post publishes', () => {
  it('publishing a new post updates / without touching Home', async () => {
    const { site, live, src } = await seededSite([post(1), post(2), post(3)]);
    expect(recentSlugs(site.home())).toEqual(['post-3', 'post-2', 'post-1']);

    const fresh = post(4);
    live.posts = [...live.posts, fresh];
    const result = await runPublishTargets({
      scope: collectRebuildScope([
        record('INSERT', { NewImage: publishedImage(fresh) }),
      ]),
      storage: site.storage,
      sources: src,
    });

    expect(recentSlugs(site.home())).toEqual(['post-4', 'post-3', 'post-2']);
    expect(site.home()).toContain('Post number 4');
    expect(site.home()).toContain('data-title="Published title line"');
    expect(site.puts).toContain('index.html');
    expect(site.puts).not.toContain(HOME_LAST_PUBLISHED_KEY);
    expect(result.invalidated).toEqual(
      expect.arrayContaining(['/', '/index.html']),
    );
  });

  it('unpublishing a post removes it from /', async () => {
    const { site, live, src } = await seededSite([post(1), post(2), post(3)]);

    live.posts = [post(1), post(2)];
    const result = await runPublishTargets({
      scope: collectRebuildScope([
        record('MODIFY', {
          OldImage: publishedImage(post(3)),
          NewImage: publishedImage(post(3), 'draft'),
        }),
      ]),
      storage: site.storage,
      sources: src,
    });

    expect(recentSlugs(site.home())).toEqual(['post-2', 'post-1']);
    expect(site.home()).not.toContain('Post number 3');
    expect(result.invalidated).toEqual(expect.arrayContaining(['/']));
  });

  it('deleting a post removes it from /', async () => {
    const { site, live, src } = await seededSite([post(1), post(2), post(3)]);

    live.posts = [post(1), post(3)];
    const result = await runPublishTargets({
      scope: collectRebuildScope([
        record('REMOVE', { OldImage: publishedImage(post(2)) }),
      ]),
      storage: site.storage,
      sources: src,
    });

    expect(recentSlugs(site.home())).toEqual(['post-3', 'post-1']);
    expect(result.invalidated).toEqual(expect.arrayContaining(['/']));
  });

  it('a body edit to a post outside the top 3 does not rewrite or invalidate /', async () => {
    const posts = [post(1), post(2), post(3), post(4)];
    const { site, live, src } = await seededSite(posts);

    live.posts = [
      post(1, {
        bodyMarkdown: 'Edited body.',
        updatedAt: '2026-09-30T00:00:00.000Z',
      }),
      post(2),
      post(3),
      post(4),
    ];
    const result = await runPublishTargets({
      scope: collectRebuildScope([
        record('MODIFY', {
          OldImage: publishedImage(post(1)),
          NewImage: publishedImage(post(1)),
        }),
      ]),
      storage: site.storage,
      sources: src,
    });

    expect(site.puts).toContain('blog/post-1/index.html');
    expect(result.invalidated).toContain('/blog*');
    expect(site.puts).not.toContain('index.html');
    expect(result.invalidated).not.toContain('/');
    expect(result.invalidated).not.toContain('/index.html');
  });

  it('a title edit to a post outside the top 3 does not rewrite /', async () => {
    const { site, live, src } = await seededSite([
      post(1),
      post(2),
      post(3),
      post(4),
    ]);

    live.posts = [
      post(1, { title: 'Renamed old post' }),
      post(2),
      post(3),
      post(4),
    ];
    const result = await runPublishTargets({
      scope: collectRebuildScope([
        record('MODIFY', {
          OldImage: publishedImage(post(1)),
          NewImage: publishedImage(post(1)),
        }),
      ]),
      storage: site.storage,
      sources: src,
    });

    expect(site.puts).not.toContain('index.html');
    expect(result.invalidated).not.toContain('/');
  });

  it('with Home unpublished, / renders from the snapshot with current recent posts', async () => {
    const lookup = {
      current: { status: 'ok', entity: HOME } as PublishedLookup<Home>,
    };
    const { site, live, src } = await seededSite(
      [post(1), post(2)],
      () => lookup.current,
    );
    expect(site.home()).toContain('Published about.');

    lookup.current = { status: 'missing' };
    live.posts = [post(1), post(2), post(3)];
    const result = await runPublishTargets({
      scope: collectRebuildScope([
        record('INSERT', { NewImage: publishedImage(post(3)) }),
      ]),
      storage: site.storage,
      sources: src,
    });

    expect(result.homeRestoredFromSnapshot).toBe(true);
    expect(site.home()).toContain('Published about.');
    expect(site.home()).toContain('data-name="Published Name"');
    expect(recentSlugs(site.home())).toEqual(['post-3', 'post-2', 'post-1']);
    expect(result.invalidated).toEqual(expect.arrayContaining(['/']));
  });

  it('with no Home and no snapshot, / renders the bundled default with recent posts', async () => {
    const site = memoryStorage();
    const { src } = sources(
      () => [post(1)],
      () => ({ status: 'missing' }),
    );
    const result = await runPublishTargets({
      scope: collectRebuildScope([
        record('INSERT', { NewImage: publishedImage(post(1)) }),
      ]),
      storage: site.storage,
      sources: src,
    });

    expect(site.home()).toContain(`data-title="${DEFAULT_HOME.title}"`);
    expect(recentSlugs(site.home())).toEqual(['post-1']);
    expect(site.puts).not.toContain(HOME_LAST_PUBLISHED_KEY);
    expect(result.homePublished).toBe(false);
    expect(result.homeRestoredFromSnapshot).toBe(false);
  });

  it('a corrupt Home row with no snapshot leaves / as it is', async () => {
    const site = memoryStorage({ 'index.html': '<p>live</p>' });
    const { src } = sources(
      () => [post(1)],
      () => ({ status: 'corrupt' }),
    );
    await runPublishTargets({
      scope: collectRebuildScope([
        record('INSERT', { NewImage: publishedImage(post(1)) }),
      ]),
      storage: site.storage,
      sources: src,
    });

    expect(site.home()).toBe('<p>live</p>');
  });

  it('with zero posts the prerender has no Recent posts heading', async () => {
    const { site, live, src } = await seededSite([post(1)]);
    expect(site.home()).toContain('Recent posts');

    live.posts = [];
    await runPublishTargets({
      scope: collectRebuildScope([
        record('REMOVE', { OldImage: publishedImage(post(1)) }),
      ]),
      storage: site.storage,
      sources: src,
    });

    expect(site.home()).not.toContain('Recent posts');
    expect(site.home()).not.toContain('home-section');
  });

  it('a Home publish renders Recent posts from the catalog', async () => {
    const { site } = await seededSite([post(1), post(2)]);
    expect(recentSlugs(site.home())).toEqual(['post-2', 'post-1']);
    expect(site.home()).toContain('Published title line');
    expect(
      JSON.parse((await site.storage.read(HOME_LAST_PUBLISHED_KEY)) ?? '{}'),
    ).toEqual(homeToSnapshot(HOME));
  });
});
