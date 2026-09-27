import { textExcerpt } from './excerpt.js';
import { escapeHtml } from './html.js';
import type { Home } from './schemas.js';

/** Stable public URL (also used by the React home header). */
export const HOME_PROFILE_IMAGE_SRC = '/profile.jpg';

/** Plain text → paragraphs; blank lines split, single newlines become breaks. */
export const renderHomeAboutHtml = (about: string): string =>
  about
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, () => '<br />')}</p>`)
    .join('');

/** Section markup only — classes match `apps/web/src/App.css`. */
export const renderHomeAboutSectionHtml = (about: string): string =>
  `<section id="about"><h2>About Me</h2><div class="about-body">${renderHomeAboutHtml(about)}</div></section>`;

/** Quick Links section — same markup as `apps/web/src/App.tsx` (CHR-116). */
export const renderHomeQuickLinksHtml = (): string =>
  `<section id="quick-links"><h2>Quick Links</h2><ul>` +
  `<li><a href="/resume">Resume</a></li>` +
  `<li><a href="/blog">Blog</a></li>` +
  `<li><a href="/contact">Contact</a></li>` +
  `<li><a href="https://www.linkedin.com/in/christophergagne/" target="_blank" rel="noopener noreferrer">LinkedIn</a></li>` +
  `<li><a href="https://github.com/gagnechris" target="_blank" rel="noopener noreferrer">GitHub</a></li>` +
  `</ul></section>`;

/** Site footer for no-JS / crawlers (CHR-122). Year is fixed at publish time. */
export const renderHomeFooterHtml = (year = new Date().getFullYear()): string =>
  `<footer class="site-footer">` +
  `<p class="site-footer__copy">© ${year} Chris Gagne</p>` +
  `<ul class="site-footer__links">` +
  `<li><a href="https://www.linkedin.com/in/christophergagne/" target="_blank" rel="noopener noreferrer">LinkedIn</a></li>` +
  `<li><a href="https://github.com/gagnechris" target="_blank" rel="noopener noreferrer">GitHub</a></li>` +
  `<li><a href="/rss.xml">RSS</a></li>` +
  `<li><a href="/dont-feed-the-bears?from=footer" class="site-footer__bear" aria-label="Don't Feed the Bears — Vermont camp mini-game" title="Don't Feed the Bears">🐻 Don't Feed the Bears</a></li>` +
  `</ul></footer>`;

/**
 * Full prerendered article the publisher injects into `index.html` and the SPA
 * reads back. Classes match React (`home-page` / `home-header`) so no-JS and
 * first paint look styled (CHR-116). `home-page-prerender` remains as a marker
 * for `publishedHome` hydration.
 */
export const renderHomePrerenderHtml = (home: Home): string => {
  const name = escapeHtml(home.name);
  const title = escapeHtml(home.title);
  const alt = escapeHtml(`Photo of ${home.name}`);
  return (
    `<article class="home-page home-page-prerender" data-name="${name}" data-title="${title}">` +
    `<header class="home-header">` +
    `<img src="${HOME_PROFILE_IMAGE_SRC}" class="profile" alt="${alt}" width="96" height="96" />` +
    `<h1>${name}</h1><p>${title}</p>` +
    `</header>` +
    `<main>${renderHomeAboutSectionHtml(home.about)}${renderHomeQuickLinksHtml()}</main>` +
    `${renderHomeFooterHtml()}` +
    `</article>`
  );
};

/** Meta-description fallback when `seo.description` is unset. */
export const homeAboutExcerpt = (about: string, max = 200): string =>
  textExcerpt(about, max);
