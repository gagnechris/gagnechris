import { describe, expect, it } from 'vitest';
import {
  findBareUrls,
  isSafeLinkHref,
  isSitePath,
  linkHref,
  linkLabel,
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

describe('findBareUrls', () => {
  const urls = (text: string) =>
    findBareUrls(text).map(({ from, to, href }) => [
      text.slice(from, to),
      href,
    ]);

  it.each([
    ['https://a.io/x', 'https://a.io/x'],
    ['http://a.io', 'http://a.io'],
    ['HTTPS://A.io/X', 'HTTPS://A.io/X'],
    ['www.a.io/x', 'https://www.a.io/x'],
  ])('finds %s', (url, href) => {
    expect(urls(`see ${url} now`)).toEqual([[url, href]]);
  });

  it.each([
    ['https://a.io/x.', 'https://a.io/x'],
    ['https://a.io/x,', 'https://a.io/x'],
    ['https://a.io/x?!', 'https://a.io/x'],
    ['https://a.io/x:', 'https://a.io/x'],
    ['https://a.io/x;', 'https://a.io/x'],
    ["'https://a.io/x'", 'https://a.io/x'],
    ['"https://a.io/x"', 'https://a.io/x'],
    ['(https://a.io/x)', 'https://a.io/x'],
    ['(https://a.io/x).', 'https://a.io/x'],
    ['<https://a.io/x>', 'https://a.io/x'],
    ['[https://a.io/x]', 'https://a.io/x'],
    ['**https://a.io/x**', 'https://a.io/x'],
    ['*https://a.io/x*', 'https://a.io/x'],
    ['_https://a.io/x_', 'https://a.io/x'],
    ['~~https://a.io/x~~', 'https://a.io/x'],
    ['|https://a.io/x|', 'https://a.io/x'],
    ['(www.a.io)', 'www.a.io'],
  ])('leaves the punctuation around %s out', (text, url) => {
    expect(urls(text).map(([u]) => u)).toEqual([url]);
  });

  it('keeps balanced parentheses and inner punctuation in the URL', () => {
    expect(
      urls('(see https://en.wikipedia.org/wiki/Foo_(bar), then)').map(
        ([u]) => u,
      ),
    ).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
    expect(urls('https://a.io/a_b.c?x=1&y=2#z').map(([u]) => u)).toEqual([
      'https://a.io/a_b.c?x=1&y=2#z',
    ]);
  });

  it('finds every URL on a line, including a long one', () => {
    const long = `https://example.com/${'segment/'.repeat(30)}end`;
    expect(urls(`a https://a.io b ${long} c www.c.io`)).toEqual([
      ['https://a.io', 'https://a.io'],
      [long, long],
      ['www.c.io', 'https://www.c.io'],
    ]);
  });

  it('ignores a scheme alone and URLs inside words or emails', () => {
    expect(urls('https:// and xhttps://a.io and me@www.a.io and www.')).toEqual(
      [],
    );
  });
});

describe('linkHref', () => {
  it('gives a www. target https and leaves the rest alone', () => {
    expect(linkHref('www.a.io/x')).toBe('https://www.a.io/x');
    expect(linkHref('https://a.io')).toBe('https://a.io');
    expect(linkHref('/notes/1')).toBe('/notes/1');
  });
});

describe('linkLabel', () => {
  it('drops http(s):// and shortens a long URL to its host', () => {
    expect(linkLabel('https://a.io/x')).toBe('a.io/x');
    expect(linkLabel('HTTP://a.io')).toBe('a.io');
    expect(linkLabel('https://example.com/a-long/path/to/somewhere')).toBe(
      'example.com/…',
    );
    expect(linkLabel('mailto:me@a.io')).toBe('mailto:me@a.io');
  });
});
