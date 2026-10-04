// Package specifiers, not relative ones: the Vite config (404 prerender) loads
// this file with Node, which can't map `./x.js` to `./x.ts`.
import { escapeHtml } from '@gagnechris/shared/html';
import {
  SITE_AUTHOR_NAME,
  SITE_PROFILE_IMAGE_SRC,
} from '@gagnechris/shared/site-config';

export { SITE_AUTHOR_NAME, SITE_PROFILE_IMAGE_SRC };

export const SITE_NAV_LINKS = [
  { label: 'Posts', href: '/posts' },
  { label: 'Resume', href: '/resume' },
  { label: 'Contact', href: '/contact' },
] as const;

export type SiteNavHref = (typeof SITE_NAV_LINKS)[number]['href'];

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

export const SITE_HEADER_PHOTO_SIZE = 40;

export const siteNavCurrent = (pathname: string): SiteNavHref | null =>
  SITE_NAV_LINKS.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  )?.href ?? null;

export const siteFooterCopy = (year: number): string =>
  `© ${year} ${SITE_AUTHOR_NAME}`;

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
      `<li><a class="site-nav__link"${href === current ? ' aria-current="page"' : ''} href="${href}">${escapeHtml(label)}</a></li>`,
  ).join('') +
  `</ul></nav></header>`;

/** Year is fixed at publish time; the SPA renders the live year. */
export const renderSiteFooterHtml = (year = new Date().getFullYear()): string =>
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
  year?: number,
): string =>
  `${renderSiteHeaderHtml(current)}${bodyHtml}${renderSiteFooterHtml(year)}`;
