import {
  PROJECT_ENTITY_TYPE,
  isFullRebuildScope,
} from '../../rebuild-scope.js';
import { buildSitemapXml } from '../../render.js';
import type { PublishTarget } from '../types.js';
import { CACHE_FEED } from '../types.js';

/** One owner for `sitemap.xml`, so a post rebuild never drops projects and vice versa. */
const target: PublishTarget = {
  id: 'sitemap',
  s3Outputs: ['sitemap.xml'],
  matches: (scope) =>
    scope.feeds ||
    scope.touchedEntityTypes.has(PROJECT_ENTITY_TYPE) ||
    isFullRebuildScope(scope),
  needs: { posts: true, projects: true },
  async run(ctx) {
    const { feedPosts, corruptPostSlugs, projects } = ctx;
    return {
      artifacts: [
        {
          key: 'sitemap.xml',
          body: buildSitemapXml(feedPosts, [...corruptPostSlugs], projects),
          contentType: 'application/xml; charset=utf-8',
          cacheControl: CACHE_FEED,
        },
      ],
      invalidationPaths: ['/sitemap.xml'],
    };
  },
};

export default target;
