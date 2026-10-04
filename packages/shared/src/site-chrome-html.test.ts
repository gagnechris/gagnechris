import { describe, expect, it } from 'vitest';
import {
  renderSiteFooterHtml,
  renderSiteHeaderHtml,
  renderSitePageHtml,
  siteNavCurrent,
} from './site-chrome-html.js';

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

describe('renderSiteHeaderHtml', () => {
  it('links photo and name home, then Posts / Resume / Contact', () => {
    const html = renderSiteHeaderHtml(null);
    expect(html).toContain(
      '<a class="site-header__home" href="/"><img class="site-header__photo" alt="" width="40" height="40" src="/profile.jpg"><span class="site-header__name">Chris Gagne</span></a>',
    );
    expect(
      [...html.matchAll(/class="site-nav__link"[^>]*>([^<]+)</g)].map(
        (m) => m[1],
      ),
    ).toEqual(['Posts', 'Resume', 'Contact']);
    expect(html).not.toContain('aria-current');
  });

  it('sets aria-current on the current section only', () => {
    const html = renderSiteHeaderHtml('/resume');
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).toContain(
      '<a class="site-nav__link" aria-current="page" href="/resume">Resume</a>',
    );
  });
});

describe('renderSiteFooterHtml', () => {
  it('renders the year, RSS and the bears game', () => {
    expect(renderSiteFooterHtml(2031)).toBe(
      '<footer class="site-footer"><p class="site-footer__copy">© 2031 Chris Gagne</p><ul class="site-footer__links"><li><a href="/rss.xml">RSS</a></li><li><a href="/dont-feed-the-bears?from=footer">Don’t feed the bears</a></li></ul></footer>',
    );
  });
});

describe('renderSitePageHtml', () => {
  it('puts the body between the header and footer', () => {
    expect(renderSitePageHtml('/posts', '<main>Body</main>', 2030)).toBe(
      `${renderSiteHeaderHtml('/posts')}<main>Body</main>${renderSiteFooterHtml(2030)}`,
    );
  });
});
