import { sortPostsNewestFirst, toListItem } from '../../posts.js';
import {
  buildRssXml,
  buildSitemapXml,
  renderPostsIndexPage,
} from '../../render.js';
import type { PublishTarget } from '../types.js';
import { CACHE_FEED, CACHE_HTML } from '../types.js';

const target: PublishTarget = {
  id: 'posts-feeds',
  optionBPaths: ['/blog'],
  adminMutationPrefixes: ['/api/admin/posts'],
  adminSoftDelete: true,
  matches(scope) {
    return scope.feeds;
  },
  needsCatalog(scope) {
    return scope.feeds;
  },
  needsShell(scope) {
    return scope.feeds;
  },
  async run(ctx) {
    const { shell, published, corruptPostSlugs, retainedPosts } = ctx;
    const feedPosts =
      retainedPosts.length > 0
        ? sortPostsNewestFirst([...published, ...retainedPosts])
        : published;
    const allowlistedSlugs = [
      ...new Set([...feedPosts.map((p) => p.slug), ...corruptPostSlugs]),
    ].filter(Boolean);
    return {
      artifacts: [
        {
          key: 'blog/index.html',
          body: renderPostsIndexPage(shell, feedPosts),
          contentType: 'text/html; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
        {
          key: 'blog/posts.json',
          body: JSON.stringify({ items: feedPosts.map(toListItem) }, null, 0),
          contentType: 'application/json; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
        {
          key: 'blog/slugs.json',
          body: JSON.stringify({ slugs: allowlistedSlugs }, null, 0),
          contentType: 'application/json; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
        {
          key: 'sitemap.xml',
          body: buildSitemapXml(feedPosts, [...corruptPostSlugs]),
          contentType: 'application/xml; charset=utf-8',
          cacheControl: CACHE_FEED,
        },
        {
          key: 'rss.xml',
          body: buildRssXml(feedPosts),
          contentType: 'application/rss+xml; charset=utf-8',
          cacheControl: CACHE_FEED,
        },
      ],
      // One wildcard covers /blog, index, posts.json, slugs.json, and every slug.
      invalidationPaths: ['/blog*', '/sitemap.xml', '/rss.xml'],
    };
  },
};

export default target;
