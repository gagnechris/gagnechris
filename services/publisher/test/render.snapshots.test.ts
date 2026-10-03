import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME, DEFAULT_RESUME, type Post } from '@gagnechris/shared';
import {
  HOME_LAST_PUBLISHED_KEY,
  homeToSnapshot,
} from '../src/home-publish.js';
import {
  buildRssXml,
  buildSitemapXml,
  renderPostsIndexPage,
  renderHomePage,
  renderPostPage,
  renderResumePage,
  renderResumeUnavailablePage,
} from '../src/render.js';
import postsFeedsTarget from '../src/publish-targets/targets/posts-feeds.target.js';
import homeTarget from '../src/publish-targets/targets/home.target.js';
import type { PublishTargetContext } from '../src/publish-targets/types.js';
import type { SiteStorage } from '../src/storage.js';

const samplePost = (): Post => ({
  id: '01TEST',
  slug: 'hello-world',
  title: 'Hello World',
  excerpt: 'A short excerpt.',
  bodyMarkdown: '# Hello\n\n**bold** text',
  tags: ['aws'],
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

describe('render HTML snapshots (CHR-143 / CHR-157)', () => {
  it('matches frozen output for home, blog index, resume, and post', () => {
    expect(renderHomePage(shell, DEFAULT_HOME)).toMatchSnapshot();
    expect(renderPostsIndexPage(shell, [samplePost()])).toMatchSnapshot();
    expect(renderResumePage(shell, DEFAULT_RESUME)).toMatchSnapshot();
    expect(renderPostPage(shell, samplePost())).toMatchSnapshot();
  });

  it('matches frozen output for resume-unavailable, RSS, and sitemap', () => {
    expect(renderResumeUnavailablePage(shell)).toMatchSnapshot();
    expect(buildRssXml([samplePost()])).toMatchSnapshot();
    expect(buildSitemapXml([samplePost()])).toMatchSnapshot();
  });

  it('matches frozen JSON from real publish targets (CHR-179)', async () => {
    const post = samplePost();
    const storage: SiteStorage = {
      async readShell() {
        return shell;
      },
      async read() {
        return undefined;
      },
      async put() {
        return true;
      },
      async delete() {
        return false;
      },
      async list() {
        return [];
      },
      async invalidate() {},
    };
    const baseCtx: Omit<PublishTargetContext, 'scope' | 'published'> = {
      shell,
      storage,
      sources: {
        listPublishedPosts: async () => ({
          posts: [post],
          corruptSlugs: [],
        }),
        getPublishedResume: async () => ({ status: 'missing' as const }),
        getPublishedHome: async () => ({
          status: 'ok' as const,
          entity: DEFAULT_HOME,
        }),
      },
      corruptPostSlugs: new Set(),
      retainedPosts: [],
    };

    const feeds = await postsFeedsTarget.run({
      ...baseCtx,
      published: [post],
      scope: {
        allPosts: false,
        postSlugs: new Set(),
        slugsToRemove: new Set(),
        feeds: true,
        home: false,
        resume: false,
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
      scope: {
        allPosts: false,
        postSlugs: new Set(),
        slugsToRemove: new Set(),
        feeds: false,
        home: true,
        resume: false,
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
