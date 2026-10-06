import { describe, expect, test } from 'vitest';
import { renderPostPageBodyHtml } from '@gagnechris/shared/render';
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

describe('postViewFromDocument head title', () => {
  test("keeps the publisher's SEO title", () => {
    expect(parse('<title>A custom SEO title</title>')?.headTitle).toBe(
      'A custom SEO title',
    );
  });

  test('falls back to the post title when the page has none', () => {
    expect(parse('')?.headTitle).toBe('Hello - Chris Gagne');
  });
});
