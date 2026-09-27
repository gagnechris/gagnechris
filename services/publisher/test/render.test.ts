import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOME,
  DEFAULT_RESUME,
  type Home,
  type Post,
  type Resume,
} from '@gagnechris/shared';
import {
  buildArticleHtml,
  buildJsonLd,
  buildRssXml,
  buildSitemapXml,
  normalizeShellHtml,
  renderBlogIndexPage,
  renderHomePage,
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
    <link rel="canonical" href="https://gagnechris.com" />
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

  it('replaces the shell canonical instead of appending a second one', () => {
    const post = renderPostPage(shell, samplePost());
    expect(post.match(/rel="canonical"/g)).toHaveLength(1);
    expect(post).toContain(
      '<link rel="canonical" href="https://gagnechris.com/blog/hello-world" />',
    );

    const index = renderBlogIndexPage(shell, [samplePost()]);
    expect(index.match(/rel="canonical"/g)).toHaveLength(1);
    expect(index).toContain(
      '<link rel="canonical" href="https://gagnechris.com/blog" />',
    );
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
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('<article class="resume-page-prerender"');
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

  it('injects home meta and the prerendered article into index.html', () => {
    const home: Home = {
      ...DEFAULT_HOME,
      status: 'published',
      publishedAt: '2026-09-27T12:00:00.000Z',
    };
    const html = renderHomePage(shell, home);
    expect(html).toContain('<title>Chris Gagne - Engineering Leader</title>');
    expect(html).toContain('property="og:url" content="https://gagnechris.com"');
    expect(html).toContain('name="description" content="I\'m an Engineering');
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('<article class="home-page-prerender"');
    expect(html).toContain('<h1>Chris Gagne</h1>');
    expect(html).toContain('/assets/index.js');
  });

  it('prefers home seo overrides for title and description', () => {
    const html = renderHomePage(shell, {
      ...DEFAULT_HOME,
      seo: { title: 'CG', description: 'Short bio' },
    });
    expect(html).toContain('<title>CG</title>');
    expect(html).toContain('name="description" content="Short bio"');
  });

  it('rebuilds index.html from a previously prerendered index.html', () => {
    const first = renderHomePage(shell, DEFAULT_HOME);
    const second = renderHomePage(normalizeShellHtml(first), {
      ...DEFAULT_HOME,
      name: 'Christopher Gagne',
      about: 'New copy.',
    });
    expect(second.match(/home-page-prerender/g)).toHaveLength(1);
    expect(second).toContain('<h1>Christopher Gagne</h1>');
    expect(second).toContain('<p>New copy.</p>');
    expect(second).not.toContain('Engineering Leader at Ro');
  });

  it('never leaks the home prerender into other pages', () => {
    const published = renderHomePage(shell, DEFAULT_HOME);
    const reusedShell = normalizeShellHtml(published);
    expect(reusedShell).toContain('<div id="root"></div>');

    const resume = renderResumePage(reusedShell, DEFAULT_RESUME);
    expect(resume).not.toContain('home-page-prerender');
    expect(resume).toContain('<article class="resume-page-prerender"');

    const post = renderPostPage(reusedShell, samplePost());
    expect(post).not.toContain('home-page-prerender');
    expect(post).toContain('data-slug="hello-world"');
  });


  it('preserves $$, $&, $`, $\' in titles, OG tags, and prerendered body', () => {
    const trickyTitle = "Making $$$ with $$ and $& and $` and $'";
    const trickyBody = "echo $$ and $& and $` and $'";
    const post = samplePost({
      title: trickyTitle,
      excerpt: trickyBody,
      bodyMarkdown: trickyBody,
      seo: null,
    });
    const html = renderPostPage(shell, post);

    // & is HTML-escaped; $ special patterns must survive replace intact.
    const escapedTitle = 'Making $$$ with $$ and $&amp; and $` and $\'';
    const escapedBody = 'echo $$ and $&amp; and $` and $\'';
    expect(html).toContain(`<title>${escapedTitle} - Chris Gagne</title>`);
    expect(html).toContain(`content="${escapedTitle} - Chris Gagne"`);
    expect(html).toContain(`content="${escapedBody}"`);
    expect(html).toContain(`<h1>${escapedTitle}</h1>`);
    expect(html).toContain(escapedBody);
    // Must not collapse $$ → $ via String.replace special patterns.
    expect(html).toContain('$$$');
    expect(html).toContain('$$');
  });

  it('escapes </script> in JSON-LD so it cannot close the script tag', () => {
    const post = samplePost({
      title: 'Break </script><script>alert(1)</script>',
      excerpt: 'excerpt with </script> too',
    });
    const html = renderPostPage(shell, post);
    const jsonLd = buildJsonLd(post);

    expect(jsonLd).toContain('\\u003c');
    expect(jsonLd).not.toContain('</script>');
    expect(html).toContain('type="application/ld+json">');
    // The raw closing tag must not appear inside the JSON-LD script body.
    const scriptMatch = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );
    expect(scriptMatch).not.toBeNull();
    expect(scriptMatch![1]).not.toContain('</script>');
    expect(scriptMatch![1]).toContain('\\u003c/script>');
    // Title still renders (HTML-escaped) in the visible document.
    expect(html).toContain('Break &lt;/script&gt;');
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
