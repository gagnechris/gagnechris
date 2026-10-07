import { postPageKey, postSlugsFromKeys } from '../../storage.js';
import type { PublishTarget } from '../types.js';

const target: PublishTarget = {
  id: 'post-orphans',
  matches(scope) {
    return (
      scope.allPosts ||
      scope.slugsToRemove.size > 0 ||
      scope.feeds ||
      scope.postSlugs.size > 0
    );
  },
  needs: { posts: true },
  async run(ctx) {
    const { scope, storage, published, corruptPostSlugs } = ctx;
    const publishedSlugs = new Set(published.map((p) => p.slug));

    const candidates: Iterable<string> =
      scope.allPosts && scope.slugsToRemove.size === 0
        ? postSlugsFromKeys(await storage.list('blog/'))
        : scope.slugsToRemove;

    const deleteKeys: string[] = [];
    for (const slug of candidates) {
      if (!slug || publishedSlugs.has(slug) || corruptPostSlugs.has(slug)) {
        continue;
      }
      deleteKeys.push(postPageKey(slug));
    }
    return {
      deleteKeys,
      invalidationPaths: deleteKeys.length > 0 ? ['/blog*', '/rss.xml'] : [],
    };
  },
};

export default target;
