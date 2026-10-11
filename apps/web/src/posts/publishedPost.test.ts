import { describe, expect, test } from 'vitest';
import { renderPostPageBodyHtml } from '@gagnechris/public-ui/server';
import { postViewFromDocument } from './publishedPost';

const body = renderPostPageBodyHtml({
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  publishedAt: null,
  bodyMarkdown: 'Hi.',
});

const parse = (head: string) =>
  postViewFromDocument(
    new DOMParser().parseFromString(
      `<html><head>${head}</head><body>${body}</body></html>`,
      'text/html',
    ),
  );

describe('postViewFromDocument head', () => {
  test("keeps the publisher's SEO title", () => {
    expect(parse('<title>A custom SEO title</title>')?.head.title).toBe(
      'A custom SEO title',
    );
  });

  test('falls back to the post title when the page has none', () => {
    expect(parse('')?.head).toEqual({ title: 'Hello - Chris Gagne' });
  });

  test("carries the publisher's description and image", () => {
    expect(
      parse(
        '<meta name="description" content="About &amp; more" /><meta property="og:image" content="https://gagnechris.com/media/hello.png" />',
      )?.head,
    ).toEqual({
      title: 'Hello - Chris Gagne',
      description: 'About & more',
      image: 'https://gagnechris.com/media/hello.png',
    });
  });
});
