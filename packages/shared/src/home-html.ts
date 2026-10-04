import { textExcerpt } from './excerpt.js';
import { escapeHtml } from './html.js';
import type { Home } from './schemas.js';
import {
  SITE_AUTHOR_NAME,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
} from './site-config.js';
import { renderSitePageHtml } from './site-chrome-html.js';

/** Single list rendered both as JSX by React and as HTML by the publisher prerender. */
export type SiteChromeLink = {
  label: string;
  href: string;
  /** `spa` → React Router; `external` → new tab; `href` → plain same-tab navigation. */
  kind: 'spa' | 'external' | 'href';
  trackId?: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
};

export const HOME_QUICK_LINKS: readonly SiteChromeLink[] = [
  { label: 'Resume', href: '/resume', kind: 'spa' },
  { label: 'Posts', href: '/posts', kind: 'spa' },
  { label: 'Contact', href: '/contact', kind: 'spa' },
  {
    label: 'LinkedIn',
    href: SITE_LINKEDIN_URL,
    kind: 'external',
    trackId: 'linkedin',
  },
  {
    label: 'GitHub',
    href: SITE_GITHUB_URL,
    kind: 'external',
    trackId: 'github',
  },
];

export { SITE_AUTHOR_NAME };
const renderChromeLinkHtml = (link: SiteChromeLink): string => {
  const label = escapeHtml(link.label);
  const href = escapeHtml(link.href);
  const classAttr = link.className
    ? ` class="${escapeHtml(link.className)}"`
    : '';
  const ariaAttr = link.ariaLabel
    ? ` aria-label="${escapeHtml(link.ariaLabel)}"`
    : '';
  const titleAttr = link.title ? ` title="${escapeHtml(link.title)}"` : '';
  if (link.kind === 'external') {
    return (
      `<a href="${href}" target="_blank" rel="noopener noreferrer"` +
      `${classAttr}${ariaAttr}${titleAttr}>${label}</a>`
    );
  }
  return `<a href="${href}"${classAttr}${ariaAttr}${titleAttr}>${label}</a>`;
};

export const renderHomeAboutHtml = (about: string): string =>
  about
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) => `<p>${escapeHtml(block).replace(/\n/g, () => '<br />')}</p>`,
    )
    .join('');

/** Section markup only — classes match `apps/web/src/App.css`. */
export const renderHomeAboutSectionHtml = (about: string): string =>
  `<section id="about"><h2>About Me</h2><div class="about-body">${renderHomeAboutHtml(about)}</div></section>`;

export const renderHomeQuickLinksHtml = (): string =>
  `<section id="quick-links"><h2>Quick Links</h2><ul>` +
  HOME_QUICK_LINKS.map((link) => `<li>${renderChromeLinkHtml(link)}</li>`).join(
    '',
  ) +
  `</ul></section>`;

/** `home-page-prerender` is the marker for `publishedHome` hydration. */
export const renderHomeBodyHtml = (home: Home): string => {
  const name = escapeHtml(home.name);
  const title = escapeHtml(home.title);
  return (
    `<article class="home-page home-page-prerender" data-name="${name}" data-title="${title}">` +
    `<header class="home-header"><h1>${name}</h1><p>${title}</p></header>` +
    `<main>${renderHomeAboutSectionHtml(home.about)}${renderHomeQuickLinksHtml()}</main>` +
    `</article>`
  );
};

export const renderHomePrerenderHtml = (home: Home, year?: number): string =>
  renderSitePageHtml(null, renderHomeBodyHtml(home), year);

export const homeAboutExcerpt = (about: string, max = 200): string =>
  textExcerpt(about, max);
