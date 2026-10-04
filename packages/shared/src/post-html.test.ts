import { describe, expect, it } from 'vitest';
import {
  POSTS_INDEX_EMPTY_TEXT,
  renderPostPageBodyHtml,
  renderPostsIndexBodyHtml,
} from './post-html.js';

describe('renderPostPageBodyHtml', () => {
  it('renders the marker article the SPA parses, with back links', () => {
    const html = renderPostPageBodyHtml({
      slug: 'hello',
      title: 'Hello & "you"',
      publishedAt: '2026-02-01T00:00:00.000Z',
      bodyMarkdown: '**hi**',
    });
    expect(html).toContain(
      '<article class="blog-post-prerender" data-slug="hello"><h1>Hello &amp; &quot;you&quot;</h1>',
    );
    expect(html).toContain(
      '<time class="post-date" datetime="2026-02-01">February 1, 2026</time>',
    );
    expect(html).toContain(
      '<div class="post-content blog-post-body"><p><strong>hi</strong></p>',
    );
    expect(html.match(/← Back to Posts/g)).toHaveLength(2);
  });

  it('omits the date for an unpublished draft preview', () => {
    const html = renderPostPageBodyHtml({
      slug: 'draft',
      title: 'Draft',
      publishedAt: null,
      bodyMarkdown: 'x',
    });
    expect(html).not.toContain('<time');
  });
});

describe('renderPostsIndexBodyHtml', () => {
  it('renders one preview per post with title, date, and excerpt', () => {
    const html = renderPostsIndexBodyHtml([
      {
        id: '01A',
        slug: 'first',
        title: 'First',
        excerpt: 'An <excerpt>',
        publishedAt: '2026-09-27T12:00:00.000Z',
      },
      {
        id: '01B',
        slug: 'second',
        title: 'Second',
        excerpt: '',
        publishedAt: null,
      },
    ]);
    expect(html).toContain(
      '<article class="post-preview" data-id="01A"><a class="post-preview__link" href="/posts/first"><h2>First</h2><time class="post-date" datetime="2026-09-27">September 27, 2026</time><p class="post-excerpt">An &lt;excerpt&gt;</p><span class="read-more">Read more →</span></a></article>',
    );
    expect(html).toContain(
      '<a class="post-preview__link" href="/posts/second"><h2>Second</h2><span class="read-more">',
    );
  });

  it('says so when nothing is published', () => {
    expect(renderPostsIndexBodyHtml([])).toContain(
      `<main><p>${POSTS_INDEX_EMPTY_TEXT}</p></main>`,
    );
  });
});
