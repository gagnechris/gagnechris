import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBRecord } from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';
import { buildProjectPublishedItem } from '@gagnechris/data';
import type { Post, Project } from '@gagnechris/shared';
import { runPublishTargets } from '../src/publish-targets/orchestrator.js';
import { publishTargets } from '../src/publish-targets/registry.js';
import type {
  PublishedProjectsCatalog,
  RebuildSiteSources,
} from '../src/publish-targets/types.js';
import {
  collectRebuildScope,
  collectStreamPublishedProjectItems,
  fullRebuildScope,
  streamNeedsRebuild,
  type RebuildScope,
} from '../src/rebuild-scope.js';
import { mergeStreamPublishedProjects } from '../src/s3-site.js';
import type { SiteStorage } from '../src/storage.js';

vi.mock('../src/viewer-request-slugs.js', () => ({
  syncViewerRequestBlogSlugs: vi.fn().mockResolvedValue(undefined),
  syncViewerRequestProjectSlugs: vi.fn().mockResolvedValue(undefined),
}));

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
    bodyMarkdown: '## Why I built it\n\nBecause.',
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

const post: Post = {
  id: '01POST00000000000000000000',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: 'hi',
  tags: [],
  projectIds: [],
  status: 'published',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

function memoryStorage() {
  const objects = new Map<string, string>();
  const invalidations: string[][] = [];
  const storage: SiteStorage = {
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
    async invalidate(paths) {
      invalidations.push(paths);
    },
  };
  return { storage, objects, invalidations };
}

function sources(
  catalog: PublishedProjectsCatalog,
  posts: Post[] = [post],
): RebuildSiteSources {
  return {
    listPublishedPosts: async () => ({ posts, corruptSlugs: [] }),
    listPublishedProjects: async () => catalog,
    getPublishedResume: async () => ({ status: 'missing' }),
    getPublishedHome: async () => ({ status: 'missing' }),
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

describe('projects publish targets', () => {
  let site: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    site = memoryStorage();
  });

  const rebuild = (
    catalog: PublishedProjectsCatalog,
    scope: RebuildScope = projectScope(),
    posts?: Post[],
  ) =>
    runPublishTargets({
      scope,
      storage: site.storage,
      sources: sources(catalog, posts),
      targets: publishTargets,
    });

  const sitemap = () => site.objects.get('sitemap.xml') ?? '';

  it('publishing renders the project page, the index and sitemap entries', async () => {
    const notebook = project({ slug: 'notebook', name: 'Notebook' });
    const result = await rebuild({ projects: [notebook], corruptSlugs: [] });

    const page = site.objects.get('projects/notebook/index.html') ?? '';
    expect(page).toContain('<h1>Notebook</h1>');
    expect(page).toContain('Because.');
    expect(page).toContain('<header class="site-header">');
    expect(page).toContain('https://gagnechris.com/projects/notebook');
    const index = site.objects.get('projects/index.html') ?? '';
    expect(index).toContain(
      '<a class="project-card__link" href="/projects/notebook">',
    );
    expect(index).toContain('<h2 class="project-card__name">Notebook</h2>');
    expect(sitemap()).toContain(
      '<loc>https://gagnechris.com/projects/notebook</loc>',
    );
    expect(sitemap()).toContain('<loc>https://gagnechris.com/projects</loc>');
    expect(sitemap()).toContain(
      '<loc>https://gagnechris.com/posts/hello</loc>',
    );
    expect(result.invalidated).toEqual(
      expect.arrayContaining(['/projects*', '/sitemap.xml']),
    );
  });

  it('an idea with no body is listed unlinked, with no page or sitemap entry', async () => {
    const idea = project({
      slug: 'someday',
      name: 'Someday',
      stage: 'idea',
      bodyMarkdown: '  ',
    });
    await rebuild({ projects: [idea], corruptSlugs: [] });
    expect(site.objects.has('projects/someday/index.html')).toBe(false);
    const index = site.objects.get('projects/index.html') ?? '';
    expect(index).toContain(
      '<div class="project-card__link"><div class="project-preview project-preview--idea"',
    );
    expect(index).toContain('<h2 class="project-card__name">Someday</h2>');
    expect(index).not.toContain('href="/projects/someday"');
    expect(sitemap()).not.toContain('/projects/someday');
  });

  it('an idea with a body gets a page', async () => {
    await rebuild({
      projects: [project({ slug: 'someday', stage: 'idea' })],
      corruptSlugs: [],
    });
    expect(site.objects.has('projects/someday/index.html')).toBe(true);
  });

  it('a project with href links there and gets no page or sitemap entry', async () => {
    const bears = project({
      slug: 'dont-feed-the-bears',
      name: 'Don’t Feed the Bears',
      stage: 'live',
      href: '/dont-feed-the-bears',
    });
    await rebuild({ projects: [bears], corruptSlugs: [] });
    expect(site.objects.has('projects/dont-feed-the-bears/index.html')).toBe(
      false,
    );
    expect(site.objects.get('projects/index.html')).toContain(
      '<a class="project-card__link" href="/dont-feed-the-bears">',
    );
    expect(sitemap()).not.toContain('/projects/dont-feed-the-bears');
  });

  it('unpublishing removes the page, the index entry and the sitemap entry', async () => {
    const notebook = project({ slug: 'notebook', name: 'Notebook' });
    const posts = project({ slug: 'posts', name: 'Posts' });
    await rebuild({ projects: [notebook, posts], corruptSlugs: [] });
    expect(sitemap()).toContain('/projects/notebook</loc>');

    site.invalidations.length = 0;
    await rebuild({ projects: [posts], corruptSlugs: [] });
    expect(site.objects.has('projects/notebook/index.html')).toBe(false);
    expect(site.objects.get('projects/index.html')).not.toContain('Notebook');
    expect(sitemap()).not.toContain('/projects/notebook');
    expect(sitemap()).toContain('/projects/posts</loc>');
    expect(site.invalidations.flat()).toEqual(
      expect.arrayContaining(['/projects*', '/sitemap.xml']),
    );

    await rebuild({ projects: [], corruptSlugs: [] });
    expect(
      [...site.objects.keys()].filter((k) => k.startsWith('projects/')),
    ).toEqual(['projects/index.html']);
    expect(site.objects.get('projects/index.html')).toContain(
      'The first project is on its way.',
    );
    expect(sitemap()).toContain('<loc>https://gagnechris.com/projects</loc>');
    expect(sitemap()).not.toContain('/projects/');
  });

  it('with nothing published, /projects is the empty state, not a 404', async () => {
    await rebuild({ projects: [], corruptSlugs: [] }, fullRebuildScope());
    const index = site.objects.get('projects/index.html') ?? '';
    expect(index).toContain('<h1>Projects</h1>');
    expect(index).toContain(
      '<p class="projects-index__empty">Nothing to show yet. The first project is on its way.</p>',
    );
    expect(index).toContain('aria-current="page" href="/projects"');
    expect(sitemap()).toContain('<loc>https://gagnechris.com/projects</loc>');
  });

  it('only corrupt rows: keeps the index that lists them, or writes the empty state when there is none', async () => {
    await rebuild({ projects: [], corruptSlugs: ['notebook'] });
    expect(site.objects.get('projects/index.html')).toContain(
      'The first project is on its way.',
    );

    site.objects.set('projects/index.html', '<html>listed notebook</html>');
    await rebuild({ projects: [], corruptSlugs: ['notebook'] });
    expect(site.objects.get('projects/index.html')).toBe(
      '<html>listed notebook</html>',
    );
  });

  it('publishing and unpublishing a project updates What I’m building on Home', async () => {
    const posts = project({ slug: 'posts', name: 'Posts', stage: 'live' });
    const notebook = project({ slug: 'notebook', name: 'Notebook', order: 1 });
    await rebuild({ projects: [posts], corruptSlugs: [] });
    const home = () => site.objects.get('index.html') ?? '';
    expect(home()).toContain('id="home-projects">What I’m building</h2>');
    expect(home()).toContain('<h3 class="project-card__name">Posts</h3>');
    // Recent posts survive a project-only rebuild.
    expect(home()).toContain('href="/posts/hello"');

    site.invalidations.length = 0;
    await rebuild({ projects: [posts, notebook], corruptSlugs: [] });
    expect(home()).toContain('<h3 class="project-card__name">Notebook</h3>');
    expect(site.invalidations.flat()).toEqual(
      expect.arrayContaining(['/', '/index.html', '/projects*']),
    );

    await rebuild({ projects: [notebook], corruptSlugs: [] });
    expect(home()).not.toContain('>Posts</h3>');

    await rebuild({ projects: [], corruptSlugs: [] });
    expect(home()).not.toContain('home-projects');
    expect(home()).toContain('href="/posts/hello"');
  });

  it('a project change Home does not show leaves / alone', async () => {
    const shown = [
      project({ slug: 'a', name: 'A', stage: 'live', order: 1 }),
      project({ slug: 'b', name: 'B', order: 2 }),
    ];
    await rebuild({ projects: shown, corruptSlugs: [] });
    site.invalidations.length = 0;

    await rebuild({
      projects: [
        ...shown,
        project({ slug: 'c', name: 'C', order: 3 }),
        project({ slug: 'd', name: 'D', stage: 'idea', order: 0 }),
      ],
      corruptSlugs: [],
    });
    expect(site.objects.get('projects/index.html')).toContain('>C</h2>');
    expect(site.invalidations.flat()).toContain('/projects*');
    expect(site.invalidations.flat()).not.toContain('/');
  });

  it('ideas are listed on /projects but not on Home', async () => {
    await rebuild({
      projects: [project({ slug: 'someday', stage: 'idea' })],
      corruptSlugs: [],
    });
    expect(site.objects.get('projects/index.html')).toContain('someday');
    expect(site.objects.get('index.html')).not.toContain('home-projects');
  });

  it('a post or Home rebuild keeps What I’m building', async () => {
    const shown = {
      projects: [project({ slug: 'notebook', name: 'Notebook' })],
      corruptSlugs: [],
    };
    for (const scope of [
      {
        ...projectScope(),
        feeds: true,
        postSlugs: new Set(['hello']),
        projectIds: new Set<string>(),
        touchedEntityTypes: new Set(['post']),
      },
      { ...projectScope(), home: true, touchedEntityTypes: new Set(['home']) },
    ]) {
      site.objects.delete('index.html');
      await rebuild(shown, scope);
      expect(site.objects.get('index.html')).toContain(
        '<h3 class="project-card__name">Notebook</h3>',
      );
    }
  });

  it('a corrupt PUBLISHED row keeps its live page and sitemap entry', async () => {
    await rebuild({
      projects: [project({ slug: 'notebook' })],
      corruptSlugs: [],
    });
    await rebuild({ projects: [], corruptSlugs: ['notebook'] });
    expect(site.objects.has('projects/notebook/index.html')).toBe(true);
    expect(site.objects.has('projects/index.html')).toBe(true);
    expect(sitemap()).toContain('/projects/notebook</loc>');
  });

  it('a post-only rebuild keeps project sitemap entries', async () => {
    await rebuild({
      projects: [project({ slug: 'notebook' })],
      corruptSlugs: [],
    });
    await rebuild(
      { projects: [project({ slug: 'notebook' })], corruptSlugs: [] },
      {
        ...projectScope(),
        feeds: true,
        postSlugs: new Set(['other']),
        projectIds: new Set(),
        touchedEntityTypes: new Set(['post']),
      },
      [post, { ...post, id: '01POST00000000000000000001', slug: 'other' }],
    );
    expect(sitemap()).toContain('/posts/other</loc>');
    expect(sitemap()).toContain('/projects/notebook</loc>');
  });

  it('a project rebuild does not touch post pages or feeds', async () => {
    await rebuild({ projects: [project({ slug: 'x' })], corruptSlugs: [] });
    expect(site.objects.has('blog/index.html')).toBe(false);
    expect(site.objects.has('rss.xml')).toBe(false);
  });

  it('full rebuilds include projects', async () => {
    await rebuild(
      { projects: [project({ slug: 'notebook' })], corruptSlugs: [] },
      fullRebuildScope(),
    );
    expect(site.objects.has('projects/notebook/index.html')).toBe(true);
    expect(sitemap()).toContain('/projects/notebook</loc>');
  });

  it('renders untrusted fields escaped and drops unsafe links', async () => {
    await rebuild({
      projects: [
        project({
          slug: 'x',
          name: '<script>alert(1)</script>',
          pitch: '"><img src=x onerror=alert(1)>',
          bodyMarkdown: '[x](javascript:alert(1)) <script>alert(2)</script>',
          links: [{ label: 'bad', url: 'javascript:alert(1)' }],
          stack: ['<b>'],
        }),
      ],
      corruptSlugs: [],
    });
    const page = site.objects.get('projects/x/index.html') ?? '';
    expect(page).not.toMatch(/<script>alert|javascript:|<img src=x/);
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('project stream records', () => {
  const record = (
    eventName: 'INSERT' | 'MODIFY' | 'REMOVE',
    image: Record<string, unknown> | undefined,
    oldImage?: Record<string, unknown>,
  ): DynamoDBRecord => ({
    eventName,
    eventSource: 'aws:dynamodb',
    dynamodb: {
      Keys: marshall({ pk: 'PROJECT#1', sk: 'PUBLISHED' }) as never,
      ...(image ? { NewImage: marshall(image) as never } : {}),
      ...(oldImage ? { OldImage: marshall(oldImage) as never } : {}),
    },
  });

  const published = buildProjectPublishedItem(
    project({ slug: 'notebook', status: 'draft' }),
  );

  it('match the projects, Home, sitemap and tagged post page targets, not post feeds', () => {
    const records = [record('INSERT', published)];
    const scope = collectRebuildScope(records);
    expect(scope.touchedEntityTypes.has('project')).toBe(true);
    expect(scope.feeds).toBe(false);
    expect(scope.postSlugs.size).toBe(0);
    expect(scope.projectIds).toEqual(new Set([published.projectId]));
    expect(streamNeedsRebuild(records, publishTargets)).toBe(true);
    const active = publishTargets
      .filter((t) => t.matches(scope))
      .map((t) => t.id);
    expect(active.sort()).toEqual([
      'home',
      'post-pages',
      'projects',
      'sitemap',
    ]);
  });

  it('an unpublish (REMOVE) still matches', () => {
    expect(
      streamNeedsRebuild(
        [record('REMOVE', undefined, published)],
        publishTargets,
      ),
    ).toBe(true);
  });

  it('a just-published project renders before GSI1 catches up', () => {
    const items = collectStreamPublishedProjectItems([
      record('INSERT', published),
    ]);
    const merged = mergeStreamPublishedProjects(
      { projects: [], corruptSlugs: [] },
      items,
    );
    expect(merged.projects.map((p) => p.slug)).toEqual(['notebook']);
  });

  it('publish then unpublish in one batch does not add it back', () => {
    const items = collectStreamPublishedProjectItems([
      record('INSERT', published),
      record('REMOVE', undefined, published),
    ]);
    expect(items).toEqual([]);
  });
});
