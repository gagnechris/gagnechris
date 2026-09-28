import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME, DEFAULT_RESUME, type Post } from '@gagnechris/shared';
import {
  renderBlogIndexPage,
  renderHomePage,
  renderPostPage,
  renderResumePage,
} from '../src/render.js';

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

describe('render HTML snapshots (CHR-143)', () => {
  it('matches frozen output for home, blog index, resume, and post', () => {
    expect(renderHomePage(shell, DEFAULT_HOME)).toMatchSnapshot();
    expect(renderBlogIndexPage(shell, [samplePost()])).toMatchSnapshot();
    expect(renderResumePage(shell, DEFAULT_RESUME)).toMatchSnapshot();
    expect(renderPostPage(shell, samplePost())).toMatchSnapshot();
  });
});
