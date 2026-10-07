import { describe, expect, it } from 'vitest';
import {
  renderSiteFooterHtml,
  renderSiteHeaderHtml,
} from '@gagnechris/shared/render';
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
  renderPostsIndexPage,
  renderHomePage,
  renderPostPage,
  renderResumePage,
  renderResumeUnavailablePage,
  resolveOgImage,
} from '../src/render.js';

const samplePost = (overrides: Partial<Post> = {}): Post => ({
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

  it('publishes script-bearing markdown inert', () => {
    const html = renderPostPage(
      shell,
      samplePost({
        bodyMarkdown: [
          '<img src=x onerror="alert(1)">',
          '[x](javascript:alert(1))',
          '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
        ].join('\n\n'),
      }),
    );
    const body = html.slice(
      html.indexOf('<div class="post-content blog-post-body">'),
    );
    expect(body).toContain('<img src="x" />');
    expect(body).not.toMatch(/onerror|javascript:|<iframe|srcdoc/i);
  });

  it('formats midnight UTC publish dates in UTC for prerender', () => {
    const html = buildArticleHtml(
      samplePost({ publishedAt: '2026-02-01T00:00:00.000Z' }),
    );
    expect(html).toContain(
      '<time class="post-date" datetime="2026-02-01">February 1, 2026</time>',
    );
  });

  it('injects OG tags and prerendered HTML into the shell', () => {
    const html = renderPostPage(shell, samplePost());
    expect(html).toContain('<title>Hello World - Chris Gagne</title>');
    expect(html).toContain('property="og:type" content="article"');
    expect(html).toContain(
      'property="og:url" content="https://gagnechris.com/posts/hello-world"',
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
      '<link rel="canonical" href="https://gagnechris.com/posts/hello-world" />',
    );

    const index = renderPostsIndexPage(shell, [samplePost()]);
    expect(index.match(/rel="canonical"/g)).toHaveLength(1);
    expect(index).toContain(
      '<link rel="canonical" href="https://gagnechris.com/posts" />',
    );
  });

  it('lists every published post with its excerpt and date in the HTML, grouped by year', () => {
    const posts = [
      samplePost({
        id: '01A',
        slug: 'old',
        title: 'Old',
        excerpt: 'From 2025.',
        publishedAt: '2025-11-12T00:00:00.000Z',
      }),
      samplePost({
        id: '01B',
        slug: 'new',
        title: 'New',
        excerpt: 'Fresh.',
        publishedAt: '2026-09-27T12:00:00.000Z',
      }),
      samplePost({
        id: '01C',
        slug: 'mid',
        title: 'Mid',
        excerpt: 'Middle.',
        publishedAt: '2026-02-01T00:00:00.000Z',
      }),
    ];
    const html = renderPostsIndexPage(shell, posts);
    const main = html.slice(
      html.indexOf('<div class="posts-index__years">'),
      html.indexOf('</main>'),
    );

    expect(
      [...main.matchAll(/<h2 class="posts-year__label"[^>]*>(\d+)</g)].map(
        (m) => m[1],
      ),
    ).toEqual(['2026', '2025']);
    expect(
      [...main.matchAll(/href="\/posts\/([^"]+)"/g)].map((m) => m[1]),
    ).toEqual(['new', 'mid', 'old']);
    for (const [slug, date, iso, excerpt] of [
      ['new', 'Sep 27', '2026-09-27', 'Fresh.'],
      ['mid', 'Feb 1', '2026-02-01', 'Middle.'],
      ['old', 'Nov 12', '2025-11-12', 'From 2025.'],
    ]) {
      expect(main).toMatch(
        new RegExp(
          `href="/posts/${slug}"><h3 class="post-preview__title">[^<]+</h3><time class="post-preview__date" datetime="${iso}">${date}</time><p class="post-preview__excerpt">${excerpt.replace('.', '\\.')}</p></a>`,
        ),
      );
    }
    expect(html).toContain(
      '<a class="posts-index__rss" href="/rss.xml">Subscribe via RSS</a>',
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
    expect(html).toContain(
      '<main class="resume-page resume-page-prerender"><header class="resume-intro">',
    );
    expect(html).toContain('/assets/index.js');
  });

  it('points Download PDF at the generated PDF whatever pdfPath says', () => {
    const html = renderResumePage(shell, {
      ...DEFAULT_RESUME,
      pdfPath: '/old/resume.pdf',
    });
    expect(html).toContain(
      '<a class="resume-download" href="/resume.pdf" download="Chris-Gagne-Resume.pdf">',
    );
    expect(html).not.toContain('/old/resume.pdf');
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
    expect(html).toContain(
      'property="og:url" content="https://gagnechris.com"',
    );
    expect(html).toContain(
      'name="description" content="I&#39;m an Engineering',
    );
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('<main class="home-page home-page-prerender"');
    expect(html).toContain('<h1 class="home-hero__name">Chris Gagne</h1>');
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

  it('rebuilds home from a pristine shell without leftover markers', () => {
    const first = renderHomePage(shell, DEFAULT_HOME);
    const second = renderHomePage(shell, {
      ...DEFAULT_HOME,
      name: 'Christopher Gagne',
      about: 'New copy.',
    });
    expect(first.match(/home-page-prerender/g)).toHaveLength(1);
    expect(second.match(/home-page-prerender/g)).toHaveLength(1);
    expect(second).toContain(
      '<h1 class="home-hero__name">Christopher Gagne</h1>',
    );
    expect(second).toContain('<p>New copy.</p>');
    expect(second).not.toContain('Engineering Leader at Ro');
  });

  it('wraps every prerendered page in the shared header and footer', () => {
    const year = new Date().getFullYear();
    const rootOf = (html: string) =>
      /<div id="root"><!--prerender:start-->([\s\S]*)<!--prerender:end--><\/div>/.exec(
        html,
      )?.[1] ?? '';
    const pages = [
      [renderHomePage(shell, DEFAULT_HOME), null],
      [renderPostsIndexPage(shell, [samplePost()]), '/posts'],
      [renderPostPage(shell, samplePost()), '/posts'],
      [renderResumePage(shell, DEFAULT_RESUME), '/resume'],
      [renderResumeUnavailablePage(shell), '/resume'],
    ] as const;
    for (const [html, current] of pages) {
      const root = rootOf(html);
      expect(root.startsWith(renderSiteHeaderHtml(current))).toBe(true);
      expect(root.endsWith(renderSiteFooterHtml(year))).toBe(true);
    }
  });

  it('never leaks home-only head tags into other pages from a pristine shell', () => {
    const homeWithOg = renderHomePage(shell, {
      ...DEFAULT_HOME,
      seo: {
        title: 'Home SEO',
        description: 'Home only',
        ogImage: '/media/home-og.jpg',
      },
    });
    expect(homeWithOg).toContain('/media/home-og.jpg');

    // Other pages must start from the pristine shell, not the home output.
    const blog = renderPostsIndexPage(shell, [samplePost()]);
    expect(blog).not.toContain('/media/home-og.jpg');
    expect(blog).not.toContain('home-page-prerender');
    expect(blog).toContain(
      'og:image" content="https://gagnechris.com/og-image.jpg"',
    );

    const resume = renderResumePage(shell, DEFAULT_RESUME);
    expect(resume).not.toContain('/media/home-og.jpg');
    expect(resume).not.toContain('home-page-prerender');

    const post = renderPostPage(shell, samplePost());
    expect(post).not.toContain('/media/home-og.jpg');
    expect(post).not.toContain('home-page-prerender');
  });

  it('renders byte-identical output when given the same pristine shell twice', () => {
    const homeA = renderHomePage(shell, DEFAULT_HOME);
    const homeB = renderHomePage(shell, DEFAULT_HOME);
    expect(homeB).toBe(homeA);

    const blogA = renderPostsIndexPage(shell, [samplePost()]);
    const blogB = renderPostsIndexPage(shell, [samplePost()]);
    expect(blogB).toBe(blogA);

    const resumeA = renderResumePage(shell, DEFAULT_RESUME);
    const resumeB = renderResumePage(shell, DEFAULT_RESUME);
    expect(resumeB).toBe(resumeA);

    const post = samplePost();
    expect(renderPostPage(shell, post)).toBe(renderPostPage(shell, post));
  });

  it("preserves $$, $&, $`, $' in titles, OG tags, and prerendered body", () => {
    const trickyTitle = "Making $$$ with $$ and $& and $` and $'";
    const trickyBody = "echo $$ and $& and $` and $'";
    const post = samplePost({
      title: trickyTitle,
      excerpt: trickyBody,
      bodyMarkdown: trickyBody,
      seo: null,
    });
    const html = renderPostPage(shell, post);

    // & and ' are HTML-escaped; $ special patterns must survive replace intact.
    const escapedTitle = 'Making $$$ with $$ and $&amp; and $` and $&#39;';
    const escapedBody = 'echo $$ and $&amp; and $` and $&#39;';
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
    expect(sitemap).toContain('https://gagnechris.com/posts/hello-world');
    expect(sitemap).toContain('<loc>https://gagnechris.com/posts</loc>');
    expect(sitemap).not.toContain('/blog');
    expect(sitemap).toContain('https://gagnechris.com/resume');

    const rss = buildRssXml(posts);
    expect(rss).toContain('<item>');
    expect(rss).toContain('Hello World');
    expect(rss).toContain(
      '<link>https://gagnechris.com/posts/hello-world</link>',
    );
    // Old guid so feed readers don't re-list existing posts.
    expect(rss).toContain(
      '<guid>https://gagnechris.com/blog/hello-world</guid>',
    );
    expect(rss).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(rss).toContain(
      '<atom:link href="https://gagnechris.com/rss.xml" rel="self" type="application/rss+xml"/>',
    );
  });
});
