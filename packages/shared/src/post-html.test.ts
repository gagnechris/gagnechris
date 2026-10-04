import { describe, expect, it } from 'vitest';
import { EVERY_MARKDOWN_ELEMENT } from './fixtures/every-markdown-element.js';
import { readingMinutes } from './post-reading.js';
import {
  POSTS_INDEX_EMPTY_TEXT,
  renderPostPageBodyHtml,
  renderPostsIndexBodyHtml,
} from './post-html.js';

describe('renderPostPageBodyHtml', () => {
  const post = {
    slug: 'hello',
    title: 'Hello & "you"',
    excerpt: 'An <intro>.',
    publishedAt: '2026-02-01T00:00:00.000Z',
    bodyMarkdown: '**hi**',
  };

  it('renders the meta line, title and excerpt above the body', () => {
    expect(renderPostPageBodyHtml(post)).toContain(
      '<article class="blog-post-prerender" data-slug="hello"><header class="post-header">' +
        '<p class="post-meta"><time class="post-date" datetime="2026-02-01">February 1, 2026</time> · ' +
        '<span class="post-reading-time" data-minutes="1">1 min read</span></p>' +
        '<h1>Hello &amp; &quot;you&quot;</h1><p class="post-excerpt">An &lt;intro&gt;.</p></header>' +
        '<div class="post-content blog-post-body"><p><strong>hi</strong></p>',
    );
  });

  it('ends with the author note, and has no back links', () => {
    const html = renderPostPageBodyHtml(post);
    expect(html).toMatch(
      /<\/article><aside class="post-author" aria-label="About the author"><p><strong>Chris Gagne<\/strong> is an engineering leader at Ro\. <a href="\/">More about me<\/a>, or follow along via <a href="\/rss\.xml">RSS<\/a>\.<\/p><\/aside><\/div>$/,
    );
    expect(html).not.toMatch(/Back to Posts|back-link/);
  });

  it('carries the shared reading time', () => {
    const bodyMarkdown = 'word '.repeat(1000);
    expect(renderPostPageBodyHtml({ ...post, bodyMarkdown })).toContain(
      `data-minutes="${readingMinutes(bodyMarkdown)}">4 min read</span>`,
    );
  });

  it('omits the date and excerpt when there are none', () => {
    const html = renderPostPageBodyHtml({
      ...post,
      excerpt: '',
      publishedAt: null,
    });
    expect(html).not.toContain('<time');
    expect(html).not.toContain('post-excerpt');
    expect(html).toContain(
      '<p class="post-meta"><span class="post-reading-time" data-minutes="1">1 min read</span></p>',
    );
  });

  it('renders a post with every markdown element, headings nested under the title', () => {
    const html = renderPostPageBodyHtml({
      ...post,
      bodyMarkdown: EVERY_MARKDOWN_ELEMENT,
    });
    for (const tag of [
      '<blockquote>',
      '<ul>',
      '<ol>',
      '<code>inline code</code>',
      '<pre tabindex="0"><code class="language-ts">',
      '<figure><img src="https://gagnechris.com/og-image.jpg" alt="A view of the site" /><figcaption>A caption under the image</figcaption></figure>',
      '<div class="post-table" role="region" tabindex="0" aria-label="Table 1"><table>',
      '<hr />',
      '<input checked disabled type="checkbox" /> A finished task',
    ]) {
      expect(html).toContain(tag);
    }
    const levels = [...html.matchAll(/<h([1-6])>/g)].map(([, n]) => Number(n));
    expect(levels).toEqual([1, 2, 3, 4]);
  });
});

describe('renderPostsIndexBodyHtml', () => {
  it('renders the title, intro and RSS link', () => {
    expect(renderPostsIndexBodyHtml([])).toContain(
      '<header class="posts-index__header"><h1>Posts</h1>' +
        '<p class="posts-index__intro">Ideas, lessons and experiments from software engineering, leadership and AI.</p>' +
        '<a class="posts-index__rss" href="/rss.xml">Subscribe via RSS</a></header>',
    );
  });

  it('groups posts under year headings, each entry one link with title, short date and excerpt', () => {
    const html = renderPostsIndexBodyHtml([
      {
        id: '01A',
        slug: 'first',
        title: 'First & best',
        excerpt: 'An <excerpt>',
        publishedAt: '2025-12-31T23:30:00.000Z',
      },
      {
        id: '01B',
        slug: 'second',
        title: 'Second',
        excerpt: '',
        publishedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
    expect(html).toContain(
      '<main><section class="posts-year" aria-labelledby="posts-2026"><h2 class="posts-year__label" id="posts-2026">2026</h2>' +
        '<ul class="posts-year__list"><li class="post-preview" data-id="01B"><a class="post-preview__link" href="/posts/second">' +
        '<h3 class="post-preview__title">Second</h3><time class="post-preview__date" datetime="2026-02-01">Feb 1</time></a></li></ul></section>' +
        '<section class="posts-year" aria-labelledby="posts-2025"><h2 class="posts-year__label" id="posts-2025">2025</h2>' +
        '<ul class="posts-year__list"><li class="post-preview" data-id="01A"><a class="post-preview__link" href="/posts/first">' +
        '<h3 class="post-preview__title">First &amp; best</h3><time class="post-preview__date" datetime="2025-12-31">Dec 31</time>' +
        '<p class="post-preview__excerpt">An &lt;excerpt&gt;</p></a></li></ul></section></main>',
    );
  });

  it('says so when nothing is published', () => {
    expect(renderPostsIndexBodyHtml([])).toContain(
      `<main><p class="posts-index__empty">${POSTS_INDEX_EMPTY_TEXT}</p></main>`,
    );
  });
});
