import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { readingMinutes, readingTimeLabel } from '@gagnechris/shared';
import { EVERY_MARKDOWN_ELEMENT } from '@gagnechris/shared/fixtures/every-markdown-element';
import { renderPostPageBodyHtml } from '@gagnechris/shared/render';
import PostArticle from './PostArticle';
import { postViewFromDocument, type PostView } from './publishedPost';

type PostInput = Parameters<typeof renderPostPageBodyHtml>[0];

const POSTS: Record<string, PostInput> = {
  'every markdown element': {
    slug: 'every-element',
    title: 'Every markdown element',
    excerpt: 'A fixture post that uses every element the editor can produce.',
    publishedAt: '2026-09-28T09:00:00.000Z',
    bodyMarkdown: EVERY_MARKDOWN_ELEMENT,
  },
  'a long post': {
    slug: 'long',
    title: 'Long & "quoted"',
    excerpt: 'It <takes> a while.',
    publishedAt: '2026-02-01T00:00:00.000Z',
    bodyMarkdown: Array.from({ length: 9 }, () => EVERY_MARKDOWN_ELEMENT).join(
      '\n\n',
    ),
  },
  'no date or excerpt': {
    slug: 'draft',
    title: 'Draft',
    excerpt: '',
    publishedAt: null,
    bodyMarkdown: 'Short.',
  },
};

/** Through the HTML parser, so React's `<img … />` and the browser's `<img …>` compare equal. */
const normalize = (html: string): string => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.innerHTML;
};

const parse = (html: string): PostView => {
  const view = postViewFromDocument(
    new DOMParser().parseFromString(html, 'text/html'),
  );
  if (!view) throw new Error('prerender did not parse');
  return view;
};

const staticMarkup = (post: PostView): string =>
  normalize(
    renderToStaticMarkup(
      <MemoryRouter>
        <PostArticle post={post} />
      </MemoryRouter>,
    ),
  );

describe('PostArticle', () => {
  test.each(Object.entries(POSTS))(
    'renders the prerender markup for %s',
    (_name, input) => {
      const prerender = renderPostPageBodyHtml(input);
      const view = parse(prerender);

      expect(staticMarkup(view)).toBe(normalize(prerender));
      const { container } = render(
        <MemoryRouter>
          <PostArticle post={view} />
        </MemoryRouter>,
      );
      expect(container.innerHTML).toBe(normalize(prerender));
    },
  );

  test.each(Object.entries(POSTS))(
    'shows the same reading time as the prerender for %s',
    (_name, input) => {
      const expected = readingTimeLabel(readingMinutes(input.bodyMarkdown));
      const prerender = new DOMParser().parseFromString(
        renderPostPageBodyHtml(input),
        'text/html',
      );
      const { container } = render(
        <MemoryRouter>
          <PostArticle post={parse(renderPostPageBodyHtml(input))} />
        </MemoryRouter>,
      );

      expect(prerender.querySelector('.post-reading-time')?.textContent).toBe(
        expected,
      );
      expect(container.querySelector('.post-reading-time')?.textContent).toBe(
        expected,
      );
    },
  );

  test('renders the prerender markup for Part of, linked and unlinked', () => {
    const partOf = [
      { name: 'Notebook', href: '/projects/notebook' },
      { name: 'Bears & co', href: '/dont-feed-the-bears' },
      { name: 'Elsewhere', href: 'https://example.com/x' },
      { name: 'Someday', href: null },
    ];
    const prerender = renderPostPageBodyHtml(
      POSTS['no date or excerpt'],
      partOf,
    );
    const view = parse(prerender);

    expect(view.partOf).toEqual(partOf);
    expect(staticMarkup(view)).toBe(normalize(prerender));
    const { container } = render(
      <MemoryRouter>
        <PostArticle post={view} />
      </MemoryRouter>,
    );
    expect(container.innerHTML).toBe(normalize(prerender));
    expect(container.querySelector('.post-part-of')?.textContent).toBe(
      'Part of Notebook, Bears & co, Elsewhere, Someday',
    );
  });

  test('the long fixture reads for more than a minute', () => {
    expect(readingMinutes(POSTS['a long post'].bodyMarkdown)).toBeGreaterThan(
      1,
    );
  });
});

describe('postViewFromDocument on pages published before this layout', () => {
  const words = 'word '.repeat(700);

  test.each([
    [
      'with back links',
      `<div class="post-page"><header><a class="back-link" href="/posts">← Back to Posts</a></header><article class="blog-post-prerender" data-slug="old"><h1>Old</h1><time class="post-date" datetime="2026-02-01">February 1, 2026</time><div class="post-content blog-post-body"><p>${words}</p></div></article><footer><a class="back-link-footer" href="/posts">← Back to Posts</a></footer></div>`,
    ],
    [
      'with the date in a header',
      `<article class="blog-post-prerender" data-slug="old"><header><h1>Old</h1><time datetime="2026-02-01">February 1, 2026</time></header><div class="blog-post-body"><p>${words}</p></div></article>`,
    ],
  ])('%s', (_name, html) => {
    expect(parse(html)).toEqual({
      slug: 'old',
      title: 'Old',
      date: '2026-02-01',
      excerpt: '',
      minutes: readingMinutes(words),
      partOf: [],
      contentHtml: `<p>${words}</p>`,
    });
    expect(readingMinutes(words)).toBe(3);
  });
});
