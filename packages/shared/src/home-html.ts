import { textExcerpt } from './excerpt.js';
import { escapeHtml } from './html.js';
import type { Home } from './schemas.js';

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

/**
 * Full prerendered article the publisher injects into `index.html` and the SPA
 * reads back. Quick Links and the profile photo stay in React (CHR-92 v1).
 */
export const renderHomePrerenderHtml = (home: Home): string =>
  `<article class="home-page-prerender" data-name="${escapeHtml(home.name)}" data-title="${escapeHtml(home.title)}"><header><h1>${escapeHtml(home.name)}</h1><p>${escapeHtml(home.title)}</p></header><main>${renderHomeAboutSectionHtml(home.about)}</main></article>`;

/** Meta-description fallback when `seo.description` is unset. */
export const homeAboutExcerpt = (about: string, max = 200): string =>
  textExcerpt(about, max);
