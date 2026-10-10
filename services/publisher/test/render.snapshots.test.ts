import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  selectHomeProjects,
  type Post,
} from '@gagnechris/shared';
import { EVERY_MARKDOWN_ELEMENT } from '@gagnechris/shared/fixtures/every-markdown-element';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import {
  HOME_LAST_PUBLISHED_KEY,
  homeToSnapshot,
} from '../src/home-publish.js';
import {
  buildArticleHtml,
  buildRssXml,
  buildSitemapXml,
  renderPostsIndexPage,
  renderHomePage,
  renderPostPage,
  renderProjectPage,
  renderProjectsIndexPage,
  renderResumePage,
  renderResumeUnavailablePage,
} from '../src/render.js';
import postsFeedsTarget from '../src/publish-targets/targets/posts-feeds.target.js';
import homeTarget from '../src/publish-targets/targets/home.target.js';
import type { PublishTargetContext } from '../src/publish-targets/types.js';
import { memoryStorage } from './fixtures/memory-storage.js';

const samplePost = (): Post => ({
  id: '01TEST',
  slug: 'hello-world',
  title: 'Hello World',
  excerpt: 'A short excerpt.',
  bodyMarkdown: '# Hello\n\n**bold** text',
  tags: ['aws'],
  projectIds: [],
  status: 'published',
  publishedAt: '2026-09-27T12:00:00.000Z',
  updatedAt: '2026-09-27T12:00:00.000Z',
  coverImage: '/media/cover.jpg',
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
});

const shell = `<!doctype html>
<html lang="en">
  <head>
    <title>Chris Gagne - Engineering Leader</title>
    <meta name="description" content="Default description" />
    <meta property="og:title" content="Chris Gagne" />
    <meta property="og:description" content="Default description" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://gagnechris.com" />
    <meta property="og:image" content="https://gagnechris.com/og-image.jpg" />
    <meta name="twitter:title" content="Chris Gagne" />
    <meta name="twitter:description" content="Default description" />
    <meta name="twitter:image" content="https://gagnechris.com/og-image.jpg" />
    <link rel="canonical" href="https://gagnechris.com" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

describe('render HTML snapshots', () => {
  // The footer year comes from the clock.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('matches frozen output for home, blog index, resume, and post', () => {
    expect(renderHomePage(shell, DEFAULT_HOME)).toMatchSnapshot();
    expect(renderPostsIndexPage(shell, [samplePost()])).toMatchSnapshot();
    expect(renderResumePage(shell, DEFAULT_RESUME)).toMatchSnapshot();
    expect(renderPostPage(shell, samplePost())).toMatchSnapshot();
  });

  it('matches frozen output for a post with every markdown element', () => {
    expect(
      buildArticleHtml({
        ...samplePost(),
        slug: 'every-element',
        title: 'Every markdown element',
        bodyMarkdown: EVERY_MARKDOWN_ELEMENT,
      }),
    ).toMatchSnapshot();
  });

  it('matches frozen output for home with Recent posts', () => {
    expect(
      renderHomePage(shell, DEFAULT_HOME, [
        samplePost(),
        { ...samplePost(), id: '01OLDER', slug: 'older', excerpt: '' },
      ]),
    ).toMatchSnapshot();
  });

  it('matches frozen output for the Projects index and Home with projects', () => {
    const projects = SAMPLE_PROJECTS.map((p) =>
      p.slug === 'notebook' ? { ...p, previewImage: '/media/notebook.png' } : p,
    );
    expect(renderProjectsIndexPage(shell, projects)).toMatchSnapshot();
    expect(renderProjectsIndexPage(shell, [])).toMatchSnapshot();
    expect(
      renderHomePage(shell, DEFAULT_HOME, [], selectHomeProjects(projects)),
    ).toMatchSnapshot();
  });

  it('matches frozen output for a project page with a demo, rows, steps and a Build log', () => {
    const posts = SAMPLE_PROJECTS.find((p) => p.slug === 'posts')!;
    expect(
      renderProjectPage(
        shell,
        {
          ...posts,
          previewImage: '/media/projects/posts.png',
          bodyMarkdown: [
            '## Why I built it',
            '',
            'Because.',
            '',
            '## How publishing works',
            '',
            '1. I write in markdown.',
            '2. Publishing writes to DynamoDB.',
            '',
            '## How it’s built',
            '',
            '- **One record per post** Versioned.',
            '- **Stack** TypeScript, React',
          ].join('\n'),
          links: [{ label: 'Source', url: 'https://github.com/gagnechris' }],
        },
        [
          {
            id: samplePost().id,
            slug: samplePost().slug,
            title: samplePost().title,
            publishedAt: samplePost().publishedAt,
          },
        ],
      ),
    ).toMatchSnapshot();
  });

  it('matches frozen output for a project page with no demo and no posts', () => {
    expect(
      renderProjectPage(shell, {
        ...SAMPLE_PROJECTS.find((p) => p.slug === 'notebook')!,
        demo: null,
      }),
    ).toMatchSnapshot();
  });

  it('matches frozen output for resume-unavailable, RSS, and sitemap', () => {
    expect(renderResumeUnavailablePage(shell)).toMatchSnapshot();
    expect(buildRssXml([samplePost()])).toMatchSnapshot();
    expect(buildSitemapXml([samplePost()])).toMatchSnapshot();
  });

  it('matches frozen JSON from real publish targets', async () => {
    const post = samplePost();
    const storage = memoryStorage({ shell });
    const baseCtx: Omit<
      PublishTargetContext,
      'scope' | 'published' | 'feedPosts'
    > = {
      shell,
      storage,
      sources: {
        readGeneration: async () => 0,
        listPublishedPosts: async () => ({
          posts: [post],
          corruptSlugs: [],
        }),
        listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
        getPublishedResume: async () => ({ status: 'missing' as const }),
        getPublishedHome: async () => ({
          status: 'ok' as const,
          entity: DEFAULT_HOME,
        }),
      },
      corruptPostSlugs: new Set(),
      retainedPosts: [],
      projects: { projects: [], corruptSlugs: [] },
    };

    const feeds = await postsFeedsTarget.run({
      ...baseCtx,
      published: [post],
      feedPosts: [post],
      scope: {
        allPosts: false,
        postSlugs: new Set(),
        slugsToRemove: new Set(),
        feeds: true,
        home: false,
        resume: false,
        projectIds: new Set(),
        touchedEntityTypes: new Set(['post']),
      },
    });
    const postsJson = feeds.artifacts?.find((a) => a.key === 'blog/posts.json');
    const slugsJson = feeds.artifacts?.find((a) => a.key === 'blog/slugs.json');
    expect(postsJson?.body).toMatchSnapshot();
    expect(slugsJson?.body).toMatchSnapshot();

    const home = await homeTarget.run({
      ...baseCtx,
      published: [],
      feedPosts: [],
      scope: {
        allPosts: false,
        postSlugs: new Set(),
        slugsToRemove: new Set(),
        feeds: false,
        home: true,
        resume: false,
        projectIds: new Set(),
        touchedEntityTypes: new Set(['home']),
      },
    });
    const lastPublished = home.artifacts?.find(
      (a) => a.key === HOME_LAST_PUBLISHED_KEY,
    );
    expect(lastPublished?.body).toMatchSnapshot();
    // Sanity: still matches the snapshot helper shape.
    expect(lastPublished?.body).toBe(
      JSON.stringify(homeToSnapshot(DEFAULT_HOME)),
    );
  });
});
