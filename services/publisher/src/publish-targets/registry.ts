/**
 * Explicit publish-target registry. Esbuild (Lambda bundle) does not expand
 * `import.meta.glob`, so each `*.target.ts` is imported below.
 *
 * Adding a published page: add `targets/<name>.target.ts` and one entry in
 * `publishTargets` — no `rebuild-scope.ts` edits; the target owns its
 * `invalidationPaths`.
 */
import type { PublishTarget } from './types.js';
import blogFeedsTarget from './targets/blog-feeds.target.js';
import homeTarget from './targets/home.target.js';
import postOrphansTarget from './targets/post-orphans.target.js';
import postPagesTarget from './targets/post-pages.target.js';
import resumeTarget from './targets/resume.target.js';

export const publishTargets: readonly PublishTarget[] = [
  postOrphansTarget,
  postPagesTarget,
  blogFeedsTarget,
  resumeTarget,
  homeTarget,
];

export function getPublishTargets(): readonly PublishTarget[] {
  return publishTargets;
}
