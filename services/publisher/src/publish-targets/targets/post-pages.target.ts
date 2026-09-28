import { mapWithConcurrency } from '../../concurrency.js';
import { renderPostPage } from '../../render.js';
import type { PublishTarget } from '../types.js';
import { CACHE_HTML } from '../types.js';

const PUT_CONCURRENCY = 8;

const target: PublishTarget = {
  id: 'post-pages',
  matches(scope) {
    return scope.allPosts || scope.postSlugs.size > 0;
  },
  needsCatalog(scope) {
    return this.matches(scope);
  },
  needsShell(scope) {
    return this.matches(scope);
  },
  async run(ctx) {
    const { scope, shell, storage, published } = ctx;
    const postsToRender = scope.allPosts
      ? published
      : published.filter((p) => scope.postSlugs.has(p.slug));

    await mapWithConcurrency(postsToRender, PUT_CONCURRENCY, async (post) => {
      const html = renderPostPage(shell, post);
      await storage.put(
        `blog/${post.slug}/index.html`,
        html,
        'text/html; charset=utf-8',
        CACHE_HTML,
      );
    });
    return {};
  },
};

export default target;
