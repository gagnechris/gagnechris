// Explicit imports: esbuild (Lambda bundle) does not expand `import.meta.glob`.
import type { PublishTarget } from './types.js';
import postsFeedsTarget from './targets/posts-feeds.target.js';
import homeTarget from './targets/home.target.js';
import postOrphansTarget from './targets/post-orphans.target.js';
import postPagesTarget from './targets/post-pages.target.js';
import projectsTarget from './targets/projects.target.js';
import resumeTarget from './targets/resume.target.js';
import sitemapTarget from './targets/sitemap.target.js';

export const publishTargets: readonly PublishTarget[] = [
  postOrphansTarget,
  postPagesTarget,
  postsFeedsTarget,
  projectsTarget,
  sitemapTarget,
  resumeTarget,
  homeTarget,
];

export function getPublishTargets(): readonly PublishTarget[] {
  return publishTargets;
}
