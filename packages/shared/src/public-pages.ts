import { pageTitle, SITE_PROJECTS_LIVE } from './site-config.js';

export const NOT_FOUND_TITLE = pageTitle('Page Not Found');
export const NOT_FOUND_LABEL = '404';
export const NOT_FOUND_HEADING = 'Page not found';
export const NOT_FOUND_TEXT =
  'This page wandered off. Unlike Vermont’s bears, it wasn’t lured by snacks.';
/** Meta description: the visible sentence is a joke. */
export const NOT_FOUND_DESCRIPTION =
  'That URL does not match a page on this site.';

const NOT_FOUND_DESTINATIONS = [
  { label: 'Home', href: '/' },
  { label: 'Posts', href: '/posts' },
  { label: 'Projects', href: '/projects' },
  { label: 'Resume', href: '/resume' },
] as const;

export const notFoundLinks = (projects: boolean) =>
  NOT_FOUND_DESTINATIONS.filter(({ href }) => projects || href !== '/projects');

export const NOT_FOUND_LINKS = notFoundLinks(SITE_PROJECTS_LIVE);

export const NOT_FOUND_BEARS = {
  label: 'Don’t feed the bears',
  href: '/dont-feed-the-bears?from=404',
  after: ' while you’re here.',
} as const;

export const CONTACT_HEADING = 'Contact';
export const CONTACT_INTRO = 'Say hello. I read everything and reply to most.';
