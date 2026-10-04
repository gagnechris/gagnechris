// Package specifiers, not relative ones: the Vite config (404 prerender) loads
// this file with Node, which can't map `./x.js` to `./x.ts`.
import { escapeHtml } from '@gagnechris/shared/html';
import {
  SITE_AUTHOR_NAME,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
  SITE_PROFILE_IMAGE_SRC,
  SITE_PROJECTS_LIVE,
} from '@gagnechris/shared/site-config';

export { SITE_AUTHOR_NAME, SITE_PROFILE_IMAGE_SRC };

const SITE_SECTIONS = [
  { label: 'Posts', href: '/posts' },
  { label: 'Projects', href: '/projects' },
  { label: 'Resume', href: '/resume' },
  { label: 'Contact', href: '/contact' },
] as const;

export type SiteNavHref = (typeof SITE_SECTIONS)[number]['href'];
export type SiteNavLink = (typeof SITE_SECTIONS)[number];

export const siteNavLinks = (projects: boolean): readonly SiteNavLink[] =>
  SITE_SECTIONS.filter(({ href }) => projects || href !== '/projects');

export const SITE_NAV_LINKS = siteNavLinks(SITE_PROJECTS_LIVE);

export type SiteFooterLink = {
  label: string;
  href: string;
  /** Routed by React Router in the SPA; plain links otherwise. */
  spa: boolean;
};

export const SITE_FOOTER_LINKS: readonly SiteFooterLink[] = [
  { label: 'RSS', href: '/rss.xml', spa: false },
  {
    label: 'Don’t feed the bears',
    href: '/dont-feed-the-bears?from=footer',
    spa: true,
  },
];

/** `trackId` links open in a new tab and send the Home links' GA click event. */
export type SiteMenuLink = SiteFooterLink & { trackId?: string };

export const SITE_MENU_LINKS: readonly SiteMenuLink[] = [
  {
    label: 'LinkedIn',
    href: SITE_LINKEDIN_URL,
    spa: false,
    trackId: 'linkedin',
  },
  { label: 'GitHub', href: SITE_GITHUB_URL, spa: false, trackId: 'github' },
  { label: 'RSS', href: '/rss.xml', spa: false },
  {
    label: 'Don’t feed the bears',
    href: '/dont-feed-the-bears?from=menu',
    spa: true,
  },
];

export const SITE_MENU_ID = 'site-menu';
export const SITE_MENU_LABEL = 'Menu';

export const SITE_HEADER_PHOTO_SIZE = 40;

export const siteNavCurrent = (pathname: string): SiteNavHref | null =>
  SITE_NAV_LINKS.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  )?.href ?? null;

export const siteFooterCopy = (year: number | string): string =>
  `© ${year} ${SITE_AUTHOR_NAME}`;

const ariaCurrent = (href: string, current: SiteNavHref | null): string =>
  href === current ? ' aria-current="page"' : '';

/*
 * Works without script: `<details>` opens and closes it, and CSS (`:has`)
 * stops the page scrolling. SiteHeader adds the focus trap and Escape.
 * `aria-expanded` here is a placeholder for React to keep in sync; browsers
 * take a summary's expanded state from its `<details>`.
 */
export const renderSiteMenuHtml = (current: SiteNavHref | null): string =>
  `<details class="site-menu">` +
  `<summary class="site-menu__button" role="button" aria-label="${SITE_MENU_LABEL}" aria-controls="${SITE_MENU_ID}" aria-expanded="false"></summary>` +
  `<nav class="site-menu__panel" id="${SITE_MENU_ID}" aria-label="${SITE_MENU_LABEL}">` +
  `<ul class="site-menu__list">` +
  SITE_NAV_LINKS.map(
    ({ label, href }) =>
      `<li><a${ariaCurrent(href, current)} href="${href}">${escapeHtml(label)}</a></li>`,
  ).join('') +
  `</ul><ul class="site-menu__more">` +
  SITE_MENU_LINKS.map(
    ({ label, href, trackId }) =>
      `<li><a href="${escapeHtml(href)}"${trackId ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a></li>`,
  ).join('') +
  `</ul></nav></details>`;

/*
 * React's SiteHeader/SiteFooter must render exactly these strings (attribute
 * order included: React's client sets `src` last, and the HTML serializer
 * writes `<img …>` without a slash), so the SPA mount replaces the prerender
 * without a layout shift.
 */
export const renderSiteHeaderHtml = (
  current: SiteNavHref | null = null,
): string =>
  `<header class="site-header">` +
  `<a class="site-header__home" href="/">` +
  `<img class="site-header__photo" alt="" width="${SITE_HEADER_PHOTO_SIZE}" height="${SITE_HEADER_PHOTO_SIZE}" src="${SITE_PROFILE_IMAGE_SRC}">` +
  `<span class="site-header__name">${escapeHtml(SITE_AUTHOR_NAME)}</span>` +
  `</a>` +
  `<nav class="site-nav" aria-label="Primary"><ul class="site-nav__list">` +
  SITE_NAV_LINKS.map(
    ({ label, href }) =>
      `<li><a class="site-nav__link"${ariaCurrent(href, current)} href="${href}">${escapeHtml(label)}</a></li>`,
  ).join('') +
  `</ul></nav>` +
  renderSiteMenuHtml(current) +
  `</header>`;

/** Year is fixed at publish time; the SPA renders the live year. */
export const renderSiteFooterHtml = (
  year: number | string = new Date().getFullYear(),
): string =>
  `<footer class="site-footer">` +
  `<p class="site-footer__copy">${escapeHtml(siteFooterCopy(year))}</p>` +
  `<ul class="site-footer__links">` +
  SITE_FOOTER_LINKS.map(
    ({ label, href }) =>
      `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`,
  ).join('') +
  `</ul></footer>`;

/** Everything the publisher puts inside `#root`: chrome around one page body. */
export const renderSitePageHtml = (
  current: SiteNavHref | null,
  bodyHtml: string,
  year?: number | string,
): string =>
  `${renderSiteHeaderHtml(current)}${bodyHtml}${renderSiteFooterHtml(year)}`;
