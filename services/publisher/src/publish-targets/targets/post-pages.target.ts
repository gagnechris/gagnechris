import { postProjectLinks } from '@gagnechris/shared';
import { renderPostPage } from '../../render.js';
import type { PublishTarget } from '../types.js';
import { CACHE_HTML } from '../types.js';

const target: PublishTarget = {
  id: 'post-pages',
  matches(scope) {
    return (
      scope.allPosts || scope.postSlugs.size > 0 || scope.projectIds.size > 0
    );
  },
  needsCatalog(scope) {
    return this.matches(scope);
  },
  needsShell(scope) {
    return this.matches(scope);
  },
  needsProjects(scope) {
    return this.matches(scope);
  },
  async run(ctx) {
    const { scope, shell, published, projects } = ctx;
    // Tagged posts re-render too, so "Part of" follows a project's rename.
    const postsToRender = scope.allPosts
      ? published
      : published.filter(
          (p) =>
            scope.postSlugs.has(p.slug) ||
            p.projectIds.some((id) => scope.projectIds.has(id)),
        );

    return {
      artifacts: postsToRender.map((post) => ({
        key: `blog/${post.slug}/index.html`,
        body: renderPostPage(
          shell,
          post,
          postProjectLinks(post.projectIds, projects.projects),
        ),
        contentType: 'text/html; charset=utf-8',
        cacheControl: CACHE_HTML,
      })),
      invalidationPaths: postsToRender.length > 0 ? ['/blog*'] : [],
    };
  },
};

export default target;
