import { toListItem } from '../../posts.js';
import {
  buildRssXml,
  buildSitemapXml,
  renderBlogIndexPage,
} from '../../render.js';
import type { PublishTarget } from '../types.js';
import { CACHE_FEED, CACHE_HTML } from '../types.js';

const target: PublishTarget = {
  id: 'blog-feeds',
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
    const { shell, published } = ctx;
    return {
      artifacts: [
        {
          key: 'blog/index.html',
          body: renderBlogIndexPage(shell, published),
          contentType: 'text/html; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
        {
          key: 'blog/posts.json',
          body: JSON.stringify({ items: published.map(toListItem) }, null, 0),
          contentType: 'application/json; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
        {
          key: 'blog/slugs.json',
          body: JSON.stringify(
            { slugs: published.map((p) => p.slug) },
            null,
            0,
          ),
          contentType: 'application/json; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
        {
          key: 'sitemap.xml',
          body: buildSitemapXml(published),
          contentType: 'application/xml; charset=utf-8',
          cacheControl: CACHE_FEED,
        },
        {
          key: 'rss.xml',
          body: buildRssXml(published),
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
