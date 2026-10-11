import { describe, expect, it } from 'vitest';
import { readingMinutes } from '@gagnechris/shared';
import { EVERY_MARKDOWN_ELEMENT } from '@gagnechris/shared/fixtures/every-markdown-element';
import { renderPostArticleHtml, renderPostPageBodyHtml } from '../server.js';

describe('PostPageBody', () => {
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
        '<p class="post-meta"><time class="post-date" dateTime="2026-02-01">February 1, 2026</time> · ' +
        '<span class="post-reading-time" data-minutes="1">1 min read</span></p>' +
        '<h1>Hello &amp; &quot;you&quot;</h1><p class="post-excerpt">An &lt;intro&gt;.</p></header>' +
        '<div class="post-content blog-post-body"><p><strong>hi</strong></p>',
    );
  });

  it('is one <main> that holds the h1 and ends with the author note, and has no back links', () => {
    const html = renderPostPageBodyHtml(post);
    expect(html).toMatch(/^<main class="post-page"><article [^]*<h1>/);
    expect(html).toMatch(
      /<\/article><section class="post-author" aria-label="About the author"><p><strong>Chris Gagne<\/strong> is an engineering leader at Ro\. <a href="\/">More about me<\/a>, or follow along via <a href="\/rss\.xml">RSS<\/a>\.<\/p><\/section><\/main>$/,
    );
    expect(html).not.toContain('<aside');
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
      '<input aria-label="Task" checked disabled type="checkbox" /> A finished task',
    ]) {
      expect(html).toContain(tag);
    }
    const levels = [...html.matchAll(/<h([1-6])>/g)].map(([, n]) => Number(n));
    expect(levels).toEqual([1, 2, 3, 4]);
  });
});

describe('PostArticle', () => {
  it('takes the title level for embeds and has no author note', () => {
    const html = renderPostArticleHtml(
      {
        slug: 'hello',
        title: 'Hello',
        excerpt: '',
        publishedAt: '2026-02-01T00:00:00.000Z',
        bodyMarkdown: '## Section',
      },
      [],
      3,
    );
    expect(html).toContain('<h3>Hello</h3>');
    expect(html).not.toMatch(/<h1|post-author|<main/);
  });

  it('lists the projects a post is part of, linked when they have a page', () => {
    const html = renderPostArticleHtml(
      {
        slug: 'hello',
        title: 'Hello',
        excerpt: '',
        publishedAt: null,
        bodyMarkdown: 'Hi.',
      },
      [
        { name: 'Notebook', href: '/projects/notebook' },
        { name: 'Someday', href: null },
      ],
    );
    expect(html).toContain(
      '<p class="post-part-of">Part of the <a class="post-part-of__project" href="/projects/notebook">Notebook</a>' +
        ' and <span class="post-part-of__project">Someday</span> projects</p>',
    );
  });
});
