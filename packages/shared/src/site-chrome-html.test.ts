import { describe, expect, it } from 'vitest';
import {
  renderSiteFooterHtml,
  renderSiteHeaderHtml,
  renderSiteMenuHtml,
  renderSitePageHtml,
  SITE_NAV_LINKS,
  siteNavCurrent,
  siteNavLinks,
} from './site-chrome-html.js';

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

  it('sets aria-current on the current section only, in the nav and the menu', () => {
    const html = renderSiteHeaderHtml('/resume');
    expect(html.match(/aria-current/g)).toHaveLength(2);
    expect(html).toContain(
      '<a class="site-nav__link" aria-current="page" href="/resume">Resume</a>',
    );
    expect(html).toContain('<a aria-current="page" href="/resume">Resume</a>');
  });

  it('ends with the phone menu', () => {
    expect(
      renderSiteHeaderHtml('/posts').endsWith(
        `</nav>${renderSiteMenuHtml('/posts')}</header>`,
      ),
    ).toBe(true);
  });
});

describe('site sections', () => {
  it('list Projects only once it is live', () => {
    expect(labels(siteNavLinks(true))).toEqual([
      'Posts',
      'Projects',
      'Resume',
      'Contact',
    ]);
    expect(labels(siteNavLinks(false))).toEqual(['Posts', 'Resume', 'Contact']);
    expect(labels(SITE_NAV_LINKS)).toEqual(['Posts', 'Resume', 'Contact']);
  });
});

describe('renderSiteMenuHtml', () => {
  it('is a details disclosure with a labelled button that controls the panel', () => {
    expect(renderSiteMenuHtml(null)).toMatch(
      /^<details class="site-menu"><summary class="site-menu__button" role="button" aria-label="Menu" aria-controls="site-menu" aria-expanded="false"><\/summary><nav class="site-menu__panel" id="site-menu" aria-label="Menu">/,
    );
  });

  it('lists the sections, then LinkedIn, GitHub, RSS and the bears game', () => {
    const html = renderSiteMenuHtml(null);
    expect(
      [...html.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]),
    ).toEqual([
      'Posts',
      'Resume',
      'Contact',
      'LinkedIn',
      'GitHub',
      'RSS',
      'Don’t feed the bears',
    ]);
    expect(html).toContain(
      '<ul class="site-menu__more"><li><a href="https://www.linkedin.com/in/christophergagne/" target="_blank" rel="noopener noreferrer">LinkedIn</a></li><li><a href="https://github.com/gagnechris" target="_blank" rel="noopener noreferrer">GitHub</a></li><li><a href="/rss.xml">RSS</a></li><li><a href="/dont-feed-the-bears?from=menu">Don’t feed the bears</a></li></ul>',
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
