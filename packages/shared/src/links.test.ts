import { describe, expect, it } from 'vitest';
import {
  isSafeLinkHref,
  POST_LINK_SCHEMES,
  PROJECT_HREF_SCHEMES,
} from './links.js';
import { renderMarkdownToHtml } from './markdown.js';

const keptByPostSanitizer = (url: string): boolean =>
  renderMarkdownToHtml(`[x](<${url}>)`).includes('href=');

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
