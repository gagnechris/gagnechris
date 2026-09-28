import { mapWithConcurrency } from '../../concurrency.js';
import { toListItem } from '../../posts.js';
import {
  buildRssXml,
  buildSitemapXml,
  renderBlogIndexPage,
} from '../../render.js';
import type { PublishTarget } from '../types.js';
import { CACHE_FEED, CACHE_HTML } from '../types.js';

const PUT_CONCURRENCY = 8;

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
    const { shell, storage, published } = ctx;
    const feedPuts: Array<() => Promise<boolean>> = [
      () =>
        storage.put(
          'blog/index.html',
          renderBlogIndexPage(shell, published),
          'text/html; charset=utf-8',
          CACHE_HTML,
        ),
      () =>
        storage.put(
          'blog/posts.json',
          JSON.stringify({ items: published.map(toListItem) }, null, 0),
          'application/json; charset=utf-8',
          CACHE_HTML,
        ),
      () =>
        storage.put(
          'blog/slugs.json',
          JSON.stringify({ slugs: published.map((p) => p.slug) }, null, 0),
          'application/json; charset=utf-8',
          CACHE_HTML,
        ),
      () =>
        storage.put(
          'sitemap.xml',
          buildSitemapXml(published),
          'application/xml; charset=utf-8',
          CACHE_FEED,
        ),
      () =>
        storage.put(
          'rss.xml',
          buildRssXml(published),
          'application/rss+xml; charset=utf-8',
          CACHE_FEED,
        ),
    ];
    await mapWithConcurrency(feedPuts, PUT_CONCURRENCY, (fn) => fn());
    return {};
  },
};

export default target;
