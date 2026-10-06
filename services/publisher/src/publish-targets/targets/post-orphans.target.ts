import { postSlugsFromKeys } from '../../storage.js';
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
  needsCatalog(scope) {
    return this.matches(scope);
  },
  needsShell() {
    return false;
  },
  async run(ctx) {
    const { scope, storage, published, corruptPostSlugs } = ctx;
    const publishedSlugs = new Set(published.map((p) => p.slug));

    let candidates: Iterable<string>;
    if (scope.allPosts && scope.slugsToRemove.size === 0) {
      const keys = await storage.list('blog/');
      candidates = postSlugsFromKeys(keys);
    } else {
      candidates = scope.slugsToRemove;
    }

    const deleteKeys: string[] = [];
    for (const slug of candidates) {
      if (!slug || publishedSlugs.has(slug) || corruptPostSlugs.has(slug)) {
        continue;
      }
      deleteKeys.push(`blog/${slug}/index.html`);
    }
    return {
      deleteKeys,
      invalidationPaths: deleteKeys.length > 0 ? ['/blog*', '/rss.xml'] : [],
    };
  },
};

export default target;
