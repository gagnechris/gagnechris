import { describe, expect, it } from 'vitest';
import { DEFAULT_RESUME, type Post, type Resume } from '@gagnechris/shared';
import {
  buildArticleHtml,
  buildRssXml,
  buildSitemapXml,
  renderPostPage,
  renderResumePage,
  resolveOgImage,
} from '../src/render.js';

const samplePost = (overrides: Partial<Post> = {}): Post => ({
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
  ...overrides,
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
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

describe('publisher render', () => {
  it('renders markdown into the article body', () => {
    const html = buildArticleHtml(samplePost());
    expect(html).toContain('<h1>Hello World</h1>');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('injects OG tags and prerendered HTML into the shell', () => {
    const html = renderPostPage(shell, samplePost());
    expect(html).toContain('<title>Hello World - Chris Gagne</title>');
    expect(html).toContain('property="og:type" content="article"');
    expect(html).toContain(
      'property="og:url" content="https://gagnechris.com/blog/hello-world"',
    );
    expect(html).toContain(
      'property="og:image" content="https://gagnechris.com/media/cover.jpg"',
    );
    expect(html).toContain('application/ld+json');
    expect(html).toContain('BlogPosting');
    expect(html).toContain('<div id="root">');
    expect(html).toContain('data-slug="hello-world"');
    expect(html).toContain('/assets/index.js');
  });

  it('prefers seo.ogImage when set', () => {
    expect(
      resolveOgImage(
        samplePost({ seo: { ogImage: 'https://cdn.example/x.png' } }),
      ),
    ).toBe('https://cdn.example/x.png');
  });

  it('injects resume meta and the prerendered article into the shell', () => {
    const resume: Resume = {
      ...DEFAULT_RESUME,
      status: 'published',
      publishedAt: '2026-09-27T12:00:00.000Z',
    };
    const html = renderResumePage(shell, resume);
    expect(html).toContain('<title>Resume - Chris Gagne</title>');
    expect(html).toContain(
      'property="og:url" content="https://gagnechris.com/resume"',
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://gagnechris.com/resume" />',
    );
    expect(
      renderResumePage(
        shell.replace(
          '</head>',
          '<link rel="canonical" href="https://gagnechris.com" /></head>',
        ),
        resume,
      ).match(/rel="canonical"/g),
    ).toHaveLength(1);
    expect(html).toContain('<div id="root"><article class="resume-page-prerender"');
    expect(html).toContain('data-pdf="/resume.pdf"');
    expect(html).toContain('/assets/index.js');
  });

  it('prefers resume seo overrides for title and description', () => {
    const html = renderResumePage(shell, {
      ...DEFAULT_RESUME,
      seo: { title: 'CV', description: 'Short bio' },
    });
    expect(html).toContain('<title>CV</title>');
    expect(html).toContain('name="description" content="Short bio"');
  });

  it('builds sitemap and RSS for published posts', () => {
    const posts = [samplePost()];
    const sitemap = buildSitemapXml(posts);
    expect(sitemap).toContain('https://gagnechris.com/blog/hello-world');
    expect(sitemap).toContain('https://gagnechris.com/resume');

    const rss = buildRssXml(posts);
    expect(rss).toContain('<item>');
    expect(rss).toContain('Hello World');
  });
});
