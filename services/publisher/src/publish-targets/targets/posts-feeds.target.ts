import { toListItem } from '../../posts.js';
import { buildRssXml, renderPostsIndexPage } from '../../render.js';
import { postSlugsFromKeys } from '../../storage.js';
import { BLOG_SLUG_NAMESPACE } from '../../viewer-request-slugs.js';
import { htmlArtifact, jsonArtifact } from '../artifacts.js';
import type { PublishTarget } from '../types.js';
import { CACHE_FEED } from '../types.js';

const STALE_SLUGS_JSON_KEY = 'blog/slugs.json';

const target: PublishTarget = {
  id: 'posts-feeds',
  s3Outputs: ['blog/*', 'rss.xml'],
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
    const { shell, feedPosts } = ctx;
    return {
      artifacts: [
        htmlArtifact('blog/index.html', renderPostsIndexPage(shell, feedPosts)),
        jsonArtifact('blog/posts.json', { items: feedPosts.map(toListItem) }),
        {
          key: 'rss.xml',
          body: buildRssXml(feedPosts),
          contentType: 'application/rss+xml; charset=utf-8',
          cacheControl: CACHE_FEED,
        },
      ],
      // Not an output; deleted wherever a bucket still holds it.
      deleteKeys: [STALE_SLUGS_JSON_KEY],
      // One wildcard covers /blog, index, posts.json, and every slug.
      invalidationPaths: ['/blog*', '/rss.xml'],
    };
  },
};

export default target;
