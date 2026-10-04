import { sortPostsNewestFirst } from '../../posts.js';
import {
  PROJECT_ENTITY_TYPE,
  isFullRebuildScope,
} from '../../rebuild-scope.js';
import { buildSitemapXml } from '../../render.js';
import type { PublishTarget } from '../types.js';
import { CACHE_FEED } from '../types.js';

const touchesSitemap = (
  scope: Parameters<PublishTarget['matches']>[0],
): boolean =>
  scope.feeds ||
  scope.touchedEntityTypes.has(PROJECT_ENTITY_TYPE) ||
  isFullRebuildScope(scope);

/** One owner for `sitemap.xml`, so a post rebuild never drops projects and vice versa. */
const target: PublishTarget = {
  id: 'sitemap',
  matches: touchesSitemap,
  needsCatalog: touchesSitemap,
  needsShell: () => false,
  needsProjects: touchesSitemap,
  async run(ctx) {
    const { published, retainedPosts, corruptPostSlugs, projects } = ctx;
    const posts =
      retainedPosts.length > 0
        ? sortPostsNewestFirst([...published, ...retainedPosts])
        : published;
    return {
      artifacts: [
        {
          key: 'sitemap.xml',
          body: buildSitemapXml(posts, [...corruptPostSlugs], projects),
          contentType: 'application/xml; charset=utf-8',
          cacheControl: CACHE_FEED,
        },
      ],
      invalidationPaths: ['/sitemap.xml'],
    };
  },
};

export default target;
