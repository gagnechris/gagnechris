import { textExcerpt } from './excerpt.js';
import { escapeHtml } from './html.js';
import { PROJECTS_PATH } from './projects.js';
import {
  SITE_AUTHOR_NAME,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
} from './site-config.js';

export { SITE_AUTHOR_NAME };

export type HomeLink = {
  label: string;
  href: string;
  /** `spa` → React Router; `external` → new tab. */
  kind: 'spa' | 'external';
  trackId?: string;
};

/** Plain strings are text; React and the prerender both walk this list. */
export type HomeLinksSegment = string | HomeLink;

export const HOME_LINKS_SENTENCE: readonly HomeLinksSegment[] = [
  'Read my ',
  { label: 'posts', href: '/posts', kind: 'spa' },
  ', see ',
  { label: 'what I’m building', href: PROJECTS_PATH, kind: 'spa' },
  ', check out my ',
  { label: 'resume', href: '/resume', kind: 'spa' },
  ', or find me on ',
  {
    label: 'LinkedIn',
    href: SITE_LINKEDIN_URL,
    kind: 'external',
    trackId: 'linkedin',
  },
  ' and ',
  {
    label: 'GitHub',
    href: SITE_GITHUB_URL,
    kind: 'external',
    trackId: 'github',
  },
  '.',
];

export {
  HOME_ALL_POSTS_LABEL,
  HOME_RECENT_POSTS_HEADING,
  HOME_RECENT_POSTS_HEADING_ID,
  HOME_RECENT_POSTS_LIMIT,
  selectHomeRecentPosts,
  type HomeRecentPost,
} from './posts-index.js';

export const homePostHref = (slug: string): string => `/posts/${slug}`;

export const renderHomeAboutHtml = (about: string): string =>
  about
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) => `<p>${escapeHtml(block).replace(/\n/g, () => '<br />')}</p>`,
    )
    .join('');

export const HOME_PROJECTS_HEADING = 'What I’m building';
export const HOME_PROJECTS_HEADING_ID = 'home-projects';
export const HOME_ALL_PROJECTS_LABEL = 'All projects';

export const homeAboutExcerpt = (about: string, max = 200): string =>
  textExcerpt(about, max);
