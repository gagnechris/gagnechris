import { describe, expect, it } from 'vitest';
import {
  renderBearsShellHtml,
  renderContactPageHtml,
  renderNotFoundPageHtml,
  renderSitePageHtml,
} from '../server.js';

const header = (html: string) =>
  html.slice(0, html.indexOf('</header>') + '</header>'.length);
const menu = (html: string) =>
  html.slice(html.indexOf('<details'), html.indexOf('</details>') + 10);
const footer = (html: string) => html.slice(html.indexOf('<footer'));

describe('site header', () => {
  it('links photo and name home, then Posts / Projects / Resume / Contact', () => {
    const html = header(renderSitePageHtml(null, '', 2026));
    expect(html).toContain(
      '<a class="site-header__home" href="/"><img class="site-header__photo" alt="" width="40" height="40" fetchPriority="low" src="/profile.jpg"/><span class="site-header__name">Chris Gagne</span></a>',
    );
    expect(
      [...html.matchAll(/class="site-nav__link"[^>]*>([^<]+)</g)].map(
        (m) => m[1],
      ),
    ).toEqual(['Posts', 'Projects', 'Resume', 'Contact']);
    expect(html).not.toContain('aria-current');
  });

  it('puts nothing before the header, such as an image preload', () => {
    expect(renderSitePageHtml(null, '', 2026)).toMatch(/^<header /);
  });

  it('sets aria-current on the current section only, in the nav and the menu', () => {
    const html = header(renderSitePageHtml('/resume', '', 2026));
    expect(html.match(/aria-current/g)).toHaveLength(2);
    expect(html).toContain(
      '<a class="site-nav__link" aria-current="page" href="/resume">Resume</a>',
    );
    expect(html).toContain('<a aria-current="page" href="/resume">Resume</a>');
  });

  it('ends with the phone menu', () => {
    expect(header(renderSitePageHtml('/posts', '', 2026))).toMatch(
      /<\/nav><details class="site-menu">.*<\/details><\/header>$/,
    );
  });
});

describe('phone menu', () => {
  it('is a closed details disclosure with a labelled button that controls the panel', () => {
    expect(menu(renderSitePageHtml(null, '', 2026))).toMatch(
      /^<details class="site-menu"><summary class="site-menu__button" aria-label="Menu" aria-controls="site-menu"><\/summary><nav class="site-menu__panel" id="site-menu" aria-label="Menu">/,
    );
  });

  it('lists the sections, then LinkedIn, GitHub, RSS and the bears game', () => {
    const html = menu(renderSitePageHtml(null, '', 2026));
    expect(
      [...html.matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map((m) => m[1]),
    ).toEqual([
      'Posts',
      'Projects',
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

describe('site footer', () => {
  it('renders the given year, RSS and the bears game', () => {
    expect(footer(renderSitePageHtml(null, '', 2031))).toBe(
      '<footer class="site-footer"><p class="site-footer__copy">© 2031 Chris Gagne</p><ul class="site-footer__links"><li><a href="/rss.xml">RSS</a></li><li><a href="/dont-feed-the-bears?from=footer">Don’t feed the bears</a></li></ul></footer>',
    );
  });
});

describe('renderSitePageHtml', () => {
  it('puts the body between the header and footer', () => {
    const html = renderSitePageHtml('/posts', '<main>Body</main>', 2030);
    expect(html).toBe(
      `${header(html)}<main>Body</main>${footer(renderSitePageHtml(null, '', 2030))}`,
    );
  });
});

describe('static pages', () => {
  const body = (html: string) =>
    html.slice(html.indexOf('</header>') + 9, html.indexOf('<footer'));

  it('404 is one main with its heading, the way back and the bears game', () => {
    expect(body(renderNotFoundPageHtml(2026))).toBe(
      '<main class="not-found"><p class="not-found__label">404</p><h1>Page not found</h1>' +
        '<p class="not-found__text">This page wandered off. Unlike Vermont’s bears, it wasn’t lured by snacks.</p>' +
        '<ul class="not-found__links"><li><a href="/">Home</a></li><li><a href="/posts">Posts</a></li><li><a href="/projects">Projects</a></li><li><a href="/resume">Resume</a></li></ul>' +
        '<p class="not-found__bears"><a href="/dont-feed-the-bears?from=404">Don’t feed the bears</a> while you’re here.</p></main>',
    );
    expect(header(renderNotFoundPageHtml(2026))).not.toContain('aria-current');
  });

  it('Contact is its header only, with Contact current', () => {
    const html = renderContactPageHtml(2026);
    expect(body(html)).toBe(
      '<main class="contact-page"><header class="contact-page__header"><h1>Contact</h1>' +
        '<p class="contact-page__intro">Say hello. I read everything and reply to most.</p></header></main>',
    );
    expect(header(html)).toContain(
      '<a class="site-nav__link" aria-current="page" href="/contact">',
    );
  });

  it('the bears shell is the chrome alone', () => {
    expect(body(renderBearsShellHtml(2026))).toBe('');
  });
});
