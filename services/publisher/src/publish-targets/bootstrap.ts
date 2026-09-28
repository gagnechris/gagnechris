/**
 * Registers publish targets for the orchestrator. Esbuild (Lambda bundle) does not
 * expand `import.meta.glob`, so each `*.target.ts` is imported explicitly below.
 * Adding a published page: add one new `targets/<name>.target.ts` and one import
 * + array entry here (two lines in this file).
 */
import { definePublishTarget } from './registry.js';
import blogFeedsTarget from './targets/blog-feeds.target.js';
import homeTarget from './targets/home.target.js';
import postOrphansTarget from './targets/post-orphans.target.js';
import postPagesTarget from './targets/post-pages.target.js';
import registrySelfTestTarget from './targets/registry-self-test.target.js';
import resumeTarget from './targets/resume.target.js';

const bundledTargets = [
  postOrphansTarget,
  postPagesTarget,
  blogFeedsTarget,
  resumeTarget,
  homeTarget,
  registrySelfTestTarget,
];

for (const target of bundledTargets) {
  definePublishTarget(target);
}
