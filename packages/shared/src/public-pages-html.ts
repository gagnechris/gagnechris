// Package specifiers, not relative ones: the Vite config loads this file with
// Node, which can't map `./x.js` to `./x.ts`.
import { escapeHtml } from '@gagnechris/shared/html';

export const NOT_FOUND_TITLE = 'Page Not Found - Chris Gagne';
export const NOT_FOUND_LABEL = '404';
export const NOT_FOUND_HEADING = 'Page not found';
export const NOT_FOUND_TEXT =
  'This page wandered off. Unlike Vermont’s bears, it wasn’t lured by snacks.';
/** Meta description: the visible sentence is a joke. */
export const NOT_FOUND_DESCRIPTION =
  'That URL does not match a page on this site.';

export const NOT_FOUND_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Posts', href: '/posts' },
  { label: 'Resume', href: '/resume' },
] as const;

export const NOT_FOUND_BEARS = {
  label: 'Don’t feed the bears',
  href: '/dont-feed-the-bears?from=404',
  after: ' while you’re here.',
} as const;

/* React's NotFound must render exactly this (NotFound.test.tsx). */
export const renderNotFoundBodyHtml = (): string =>
  `<main class="not-found">` +
  `<p class="not-found__label">${escapeHtml(NOT_FOUND_LABEL)}</p>` +
  `<h1>${escapeHtml(NOT_FOUND_HEADING)}</h1>` +
  `<p class="not-found__text">${escapeHtml(NOT_FOUND_TEXT)}</p>` +
  `<ul class="not-found__links">` +
  NOT_FOUND_LINKS.map(
    ({ label, href }) =>
      `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`,
  ).join('') +
  `</ul>` +
  `<p class="not-found__bears">` +
  `<a href="${escapeHtml(NOT_FOUND_BEARS.href)}">${escapeHtml(NOT_FOUND_BEARS.label)}</a>` +
  `${escapeHtml(NOT_FOUND_BEARS.after)}</p>` +
  `</main>`;

export const CONTACT_HEADING = 'Contact';
export const CONTACT_INTRO = 'Say hello. I read everything and reply to most.';

/*
 * The page header only: the form needs JavaScript (a script-less submit would
 * put the message in the URL), so React adds it below this on mount.
 */
export const renderContactPrerenderBodyHtml = (): string =>
  `<div class="contact-page">` +
  `<header class="contact-page__header">` +
  `<h1>${escapeHtml(CONTACT_HEADING)}</h1>` +
  `<p class="contact-page__intro">${escapeHtml(CONTACT_INTRO)}</p>` +
  `</header>` +
  `</div>`;
