import { describe, expect, it } from 'vitest';
import { SITE_NAV_LINKS, siteNavCurrent, siteNavLinks } from './site-chrome.js';

const labels = (links: readonly { label: string }[]) =>
  links.map(({ label }) => label);

describe('siteNavCurrent', () => {
  it('marks a section for its index and every page under it', () => {
    expect(siteNavCurrent('/posts')).toBe('/posts');
    expect(siteNavCurrent('/posts/hello')).toBe('/posts');
    expect(siteNavCurrent('/resume')).toBe('/resume');
    expect(siteNavCurrent('/contact')).toBe('/contact');
  });

  it('marks nothing on Home, games, or lookalike paths', () => {
    expect(siteNavCurrent('/')).toBeNull();
    expect(siteNavCurrent('/dont-feed-the-bears')).toBeNull();
    expect(siteNavCurrent('/postsx')).toBeNull();
  });
});

describe('site sections', () => {
  it('list Projects while it is live', () => {
    expect(labels(siteNavLinks(true))).toEqual([
      'Posts',
      'Projects',
      'Resume',
      'Contact',
    ]);
    expect(labels(siteNavLinks(false))).toEqual(['Posts', 'Resume', 'Contact']);
    expect(labels(SITE_NAV_LINKS)).toEqual([
      'Posts',
      'Projects',
      'Resume',
      'Contact',
    ]);
  });
});
