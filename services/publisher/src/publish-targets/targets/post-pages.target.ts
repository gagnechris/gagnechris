import { renderPostPage } from '../../render.js';
import type { PublishTarget } from '../types.js';
import { CACHE_HTML } from '../types.js';

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
    const { scope, shell, published } = ctx;
    const postsToRender = scope.allPosts
      ? published
      : published.filter((p) => scope.postSlugs.has(p.slug));

    return {
      artifacts: postsToRender.map((post) => ({
        key: `blog/${post.slug}/index.html`,
        body: renderPostPage(shell, post),
        contentType: 'text/html; charset=utf-8',
        cacheControl: CACHE_HTML,
      })),
      invalidationPaths: postsToRender.length > 0 ? ['/blog*'] : [],
    };
  },
};

export default target;
