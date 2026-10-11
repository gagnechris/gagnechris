export const APEX_DOMAIN = 'gagnechris.com' as const;

export const SITE_AUTHOR_NAME = 'Chris Gagne' as const;

export const pageTitle = (title: string): string =>
  `${title} - ${SITE_AUTHOR_NAME}`;

/** A project can share its name with a site section (`/projects/posts`, `/posts`). */
export const projectPageTitle = (name: string): string =>
  pageTitle(`Project: ${name}`);

/** Must match the description metas in apps/web/index.html. */
export const SITE_DEFAULT_DESCRIPTION =
  'Chris Gagne is an Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems.';

export const SITE_OG_IMAGE_PATH = '/og-image.jpg' as const;

/** `/` has no trailing slash, matching the prerendered home canonical. */
export const siteUrl = (path: string, apex: string = APEX_DOMAIN): string =>
  `https://${apex}${path === '/' ? '' : path}`;

export const SITE_PROFILE_IMAGE_SRC = '/profile.jpg' as const;

export const SITE_LINKEDIN_URL =
  'https://www.linkedin.com/in/christophergagne/' as const;

export const SITE_GITHUB_URL = 'https://github.com/gagnechris' as const;

/** The header nav and phone menu list Projects when this is on. */
export const SITE_PROJECTS_LIVE: boolean = true;
