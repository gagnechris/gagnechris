import { describe, expect, it } from 'vitest';
import {
  isSafeLinkHref,
  isSitePath,
  POST_LINK_SCHEMES,
  PROJECT_HREF_SCHEMES,
} from './links.js';
import { renderMarkdownToHtml } from './markdown.js';

const keptByPostSanitizer = (url: string): boolean =>
  renderMarkdownToHtml(`[x](<${url}>)`).includes('href=');

describe('isSitePath', () => {
  it.each(['/', '/posts/hello', '/rss.xml', '/dont-feed-the-bears?from=x'])(
    'is true for %s',
    (href) => expect(isSitePath(href)).toBe(true),
  );

  it.each([
    '//evil.example/x',
    'https://gagnechris.com/posts',
    'posts/hello',
    '',
    'mailto:me@example.com',
  ])('is false for %s', (href) => expect(isSitePath(href)).toBe(false));
});

describe('isSafeLinkHref', () => {
  it.each([
    'https://gagnechris.com/posts',
    'http://example.com',
    'mailto:me@example.com',
    'tel:+15555550100',
    '/posts/hello',
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,hi',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.example/x',
  ])('agrees with the post body sanitizer on %s', (url) => {
    expect(isSafeLinkHref(url, POST_LINK_SCHEMES)).toBe(
      keptByPostSanitizer(url),
    );
  });

  it('project href allows only site paths and https', () => {
    const ok = ['/dont-feed-the-bears', 'https://github.com/gagnechris'];
    const bad = [
      'http://example.com',
      'mailto:me@example.com',
      'dont-feed-the-bears',
      '//evil.example',
      'https://gagnechris.com@evil.example',
      'https://',
      '/a b',
      '/a\\b',
      ' /posts',
      '',
    ];
    for (const href of ok) {
      expect(isSafeLinkHref(href, PROJECT_HREF_SCHEMES), href).toBe(true);
    }
    for (const href of bad) {
      expect(isSafeLinkHref(href, PROJECT_HREF_SCHEMES), href).toBe(false);
    }
  });
});
