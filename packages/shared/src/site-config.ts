export const APEX_DOMAIN = 'gagnechris.com' as const;

export const SITE_AUTHOR_NAME = 'Chris Gagne' as const;

export const pageTitle = (title: string): string =>
  `${title} - ${SITE_AUTHOR_NAME}`;

/** `/` has no trailing slash, matching the prerendered home canonical. */
export const siteUrl = (path: string, apex: string = APEX_DOMAIN): string =>
  `https://${apex}${path === '/' ? '' : path}`;

export const SITE_PROFILE_IMAGE_SRC = '/profile.jpg' as const;

export const SITE_LINKEDIN_URL =
  'https://www.linkedin.com/in/christophergagne/' as const;

export const SITE_GITHUB_URL = 'https://github.com/gagnechris' as const;

/** The header nav and phone menu list Projects when this is on. */
export const SITE_PROJECTS_LIVE: boolean = true;
