import { describe, expect, it } from 'vitest';
import { APEX_DOMAIN, pageTitle, siteUrl } from './site-config.js';
import { notFoundLinks, NOT_FOUND_TITLE } from './public-pages-html.js';

describe('siteUrl', () => {
  it('puts a site path on the apex', () => {
    expect(siteUrl('/posts/hello')).toBe(`https://${APEX_DOMAIN}/posts/hello`);
  });

  it('writes the home canonical without a trailing slash', () => {
    expect(siteUrl('/')).toBe(`https://${APEX_DOMAIN}`);
  });

  it('takes another apex for local publishing', () => {
    expect(siteUrl('/resume', 'localhost:4173')).toBe(
      'https://localhost:4173/resume',
    );
  });
});

describe('page titles', () => {
  it('builds the 404 title from pageTitle', () => {
    expect(NOT_FOUND_TITLE).toBe(pageTitle('Page Not Found'));
  });
});

describe('notFoundLinks', () => {
  it('drops Projects while projects are not live', () => {
    expect(notFoundLinks(false).map((l) => l.href)).toEqual([
      '/',
      '/posts',
      '/resume',
    ]);
    expect(notFoundLinks(true).map((l) => l.href)).toContain('/projects');
  });
});
