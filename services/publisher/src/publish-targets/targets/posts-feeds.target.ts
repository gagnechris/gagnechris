import { toListItem } from '../../posts.js';
import { buildRssXml, renderPostsIndexPage } from '../../render.js';
import { postSlugsFromKeys } from '../../storage.js';
import { BLOG_SLUG_NAMESPACE } from '../../viewer-request-slugs.js';
import { htmlArtifact, jsonArtifact } from '../artifacts.js';
import type { PublishTarget } from '../types.js';
import { CACHE_FEED } from '../types.js';

const target: PublishTarget = {
  id: 'posts-feeds',
  optionBPaths: ['/blog'],
  adminMutationPrefixes: ['/api/admin/posts'],
  adminSoftDelete: true,
  matches(scope) {
    return scope.feeds;
  },
  needs: { posts: true, shell: true },
  kvs: {
    namespace: BLOG_SLUG_NAMESPACE,
    pagePrefix: 'blog/',
    keysFromPageKeys: postSlugsFromKeys,
  },
  async run(ctx) {
    const { shell, feedPosts, corruptPostSlugs } = ctx;
    const allowlistedSlugs = [
      ...new Set([...feedPosts.map((p) => p.slug), ...corruptPostSlugs]),
    ].filter(Boolean);
    return {
      artifacts: [
        htmlArtifact('blog/index.html', renderPostsIndexPage(shell, feedPosts)),
        jsonArtifact('blog/posts.json', { items: feedPosts.map(toListItem) }),
        jsonArtifact('blog/slugs.json', { slugs: allowlistedSlugs }),
        {
          key: 'rss.xml',
          body: buildRssXml(feedPosts),
          contentType: 'application/rss+xml; charset=utf-8',
          cacheControl: CACHE_FEED,
        },
      ],
      // One wildcard covers /blog, index, posts.json, slugs.json, and every slug.
      invalidationPaths: ['/blog*', '/rss.xml'],
    };
  },
};

export default target;
