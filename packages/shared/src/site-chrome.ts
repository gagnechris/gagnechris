import {
  SITE_AUTHOR_NAME,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
  SITE_PROFILE_IMAGE_SRC,
  SITE_PROJECTS_LIVE,
} from './site-config.js';

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
