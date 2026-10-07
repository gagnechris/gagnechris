import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBRecord } from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  buildProjectPublishedItem,
  buildPublishedItem,
} from '@gagnechris/data';
import type { Post, Project } from '@gagnechris/shared';
import { runPublishTargets } from '../src/publish-targets/orchestrator.js';
import { publishTargets } from '../src/publish-targets/registry.js';
import { collectRebuildScope } from '../src/rebuild-scope.js';
import {
  memoryStorage,
  type MemoryStorage,
} from './fixtures/memory-storage.js';

vi.mock('../src/viewer-request-slugs.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/viewer-request-slugs.js')>()),
  syncViewerRequestKeys: vi.fn().mockResolvedValue(undefined),
}));

const NOTEBOOK_ID = '01PROJECTNOTEBOOK000000000';
const POSTS_ID = '01PROJECTPOSTS000000000000';

function project(
  over: Partial<Project> & Pick<Project, 'id' | 'slug'>,
): Project {
  return {
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
    updatedAt: '2026-10-01T00:00:00.000Z',
    version: 2,
    hasUnpublishedChanges: false,
    ...over,
  };
}

function post(over: Partial<Post> & Pick<Post, 'id' | 'slug'>): Post {
  return {
    title: over.slug,
    excerpt: '',
    bodyMarkdown: 'hi',
    tags: [],
    projectIds: [],
    status: 'published',
    publishedAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    coverImage: null,
    seo: null,
    version: 3,
    hasUnpublishedChanges: false,
    ...over,
  };
}

const notebook = project({
  id: NOTEBOOK_ID,
  slug: 'notebook',
  name: 'Notebook',
});
const postsProject = project({ id: POSTS_ID, slug: 'posts', name: 'Posts' });

const record = (
  pk: string,
  oldItem: object | undefined,
  newItem: object | undefined,
): DynamoDBRecord => ({
  eventName: !oldItem ? 'INSERT' : !newItem ? 'REMOVE' : 'MODIFY',
  eventSource: 'aws:dynamodb',
  dynamodb: {
    Keys: marshall({ pk, sk: 'PUBLISHED' }) as never,
    ...(oldItem
      ? {
          OldImage: marshall(oldItem, { removeUndefinedValues: true }) as never,
        }
      : {}),
    ...(newItem
      ? {
          NewImage: marshall(newItem, { removeUndefinedValues: true }) as never,
        }
      : {}),
  },
});

const postRecord = (before: Post | undefined, after: Post | undefined) =>
  record(
    `POST#${(before ?? after)!.id}`,
    before && buildPublishedItem(before),
    after && buildPublishedItem(after),
  );

const projectRecord = (before: Project, after: Project) =>
  record(
    `PROJECT#${before.id}`,
    buildProjectPublishedItem(before),
    buildProjectPublishedItem(after),
  );

describe('post to project tagging', () => {
  let site: MemoryStorage;
  let posts: Post[];
  let projects: Project[];

  const rebuild = (records?: DynamoDBRecord[]) =>
    runPublishTargets({
      scope: records ? collectRebuildScope(records) : undefined,
      storage: site,
      sources: {
        readGeneration: async () => 0,
        listPublishedPosts: async () => ({ posts, corruptSlugs: [] }),
        listPublishedProjects: async () => ({ projects, corruptSlugs: [] }),
        getPublishedResume: async () => ({ status: 'missing' }),
        getPublishedHome: async () => ({ status: 'missing' }),
      },
      targets: publishTargets,
    });

  const page = (key: string) => site.objects.get(key) ?? '';
  const buildLog = (slug: string) =>
    /<section class="project-build-log"[\s\S]*?<\/section>/.exec(
      page(`projects/${slug}/index.html`),
    )?.[0] ?? '';

  const untagged = post({
    id: '01POSTHELLO000000000000000',
    slug: 'hello',
    title: 'Hello',
  });
  const tagged = { ...untagged, projectIds: [NOTEBOOK_ID] };

  beforeEach(async () => {
    site = memoryStorage();
    projects = [notebook, postsProject];
    posts = [untagged];
    await rebuild();
    site.puts.length = 0;
  });

  it('tagging and publishing adds the post to the Build log and shows Part of', async () => {
    expect(buildLog('notebook')).toContain('No posts about Notebook yet.');

    posts = [tagged];
    await rebuild([postRecord(untagged, tagged)]);

    expect(buildLog('notebook')).toContain(
      '<a class="project-build-log__link" href="/posts/hello"><h3 class="project-build-log__title">Hello</h3>',
    );
    expect(page('blog/hello/index.html')).toContain(
      '<p class="post-part-of">Part of the <a class="post-part-of__project" href="/projects/notebook">Notebook</a> project</p>',
    );
    expect(buildLog('posts')).not.toContain('/posts/hello');
    expect(site.puts.sort()).toEqual([
      'blog/hello/index.html',
      'projects/notebook/index.html',
    ]);
  });

  it('removing the tag and publishing drops the post from the Build log', async () => {
    posts = [tagged];
    await rebuild([postRecord(untagged, tagged)]);
    expect(buildLog('notebook')).toContain('/posts/hello');

    const retagged = { ...untagged, projectIds: [POSTS_ID] };
    posts = [retagged];
    await rebuild([postRecord(tagged, retagged)]);

    expect(buildLog('notebook')).not.toContain('/posts/hello');
    expect(buildLog('notebook')).toContain('No posts about Notebook yet.');
    expect(buildLog('posts')).toContain('/posts/hello');
    expect(page('blog/hello/index.html')).toContain(
      'href="/projects/posts">Posts</a>',
    );
  });

  it('a post unpublished while tagged leaves the Build log', async () => {
    posts = [tagged];
    await rebuild([postRecord(untagged, tagged)]);
    expect(buildLog('notebook')).toContain('/posts/hello');

    posts = [];
    await rebuild([postRecord(tagged, undefined)]);

    expect(buildLog('notebook')).not.toContain('/posts/hello');
    expect(site.objects.has('blog/hello/index.html')).toBe(false);
  });

  it('a renamed project slug keeps its Build log and the Part of links', async () => {
    posts = [tagged];
    await rebuild([postRecord(untagged, tagged)]);

    const renamed = {
      ...notebook,
      slug: 'notes',
      updatedAt: '2026-10-03T00:00:00.000Z',
    };
    projects = [renamed, postsProject];
    await rebuild([projectRecord(notebook, renamed)]);

    expect(site.objects.has('projects/notebook/index.html')).toBe(false);
    expect(buildLog('notes')).toContain(
      '<a class="project-build-log__link" href="/posts/hello"><h3 class="project-build-log__title">Hello</h3>',
    );
    expect(page('blog/hello/index.html')).toContain(
      'href="/projects/notes">Notebook</a>',
    );
  });

  it('Build log is newest first and lists only published tagged posts', async () => {
    const older = post({
      id: '01POSTOLDER000000000000000',
      slug: 'older',
      title: 'Older',
      publishedAt: '2026-09-01T00:00:00.000Z',
      projectIds: [NOTEBOOK_ID],
    });
    posts = [tagged, older];
    await rebuild([postRecord(undefined, older), postRecord(untagged, tagged)]);

    const log = buildLog('notebook');
    expect(log.indexOf('/posts/hello')).toBeGreaterThan(-1);
    expect(log.indexOf('/posts/hello')).toBeLessThan(
      log.indexOf('/posts/older'),
    );
  });

  it('a post change leaves the index, untouched projects and href projects alone', async () => {
    const bears = project({
      id: '01PROJECTBEARS000000000000',
      slug: 'bears',
      name: 'Bears',
      href: '/dont-feed-the-bears',
    });
    projects = [notebook, postsProject, bears];
    await rebuild();
    site.puts.length = 0;

    const both = { ...untagged, projectIds: [NOTEBOOK_ID, bears.id] };
    posts = [both];
    await rebuild([postRecord(untagged, both)]);

    expect(site.puts).not.toContain('projects/index.html');
    expect(site.puts).not.toContain('projects/posts/index.html');
    expect(site.objects.has('projects/bears/index.html')).toBe(false);
    expect(page('blog/hello/index.html')).toContain(
      '<a class="post-part-of__project" href="/projects/notebook">Notebook</a> and <a class="post-part-of__project" href="/dont-feed-the-bears">Bears</a> projects',
    );
  });

  it('an unpublished project is not linked from the post', async () => {
    projects = [postsProject];
    posts = [tagged];
    await rebuild([postRecord(untagged, tagged)]);
    expect(page('blog/hello/index.html')).not.toContain('post-part-of');
  });
});
