import type { Home } from './schemas.js';
import { SITE_AUTHOR_NAME } from './site-config.js';

/**
 * Seed + fallback home content. Mirrors the pre-CMS `apps/web/src/App.tsx`
 * copy so the public page never blanks before the first publish.
 */
export const DEFAULT_HOME: Home = {
  name: SITE_AUTHOR_NAME,
  title: 'Engineering Leader',
  about:
    "I'm an Engineering Leader at Ro with more than 20 years of experience building modern web technologies to solve critical business problems—and a passion for using technology to improve everyday lives.",
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-09-27T00:00:00.000Z',
  seo: null,
  version: 0,
  hasUnpublishedChanges: false,
};
