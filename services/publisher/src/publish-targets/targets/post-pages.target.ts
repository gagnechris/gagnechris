import { postProjectLinks } from '@gagnechris/shared';
import { renderPostPage } from '../../render.js';
import { postPageKey } from '../../storage.js';
import { htmlArtifact } from '../artifacts.js';
import type { PublishTarget } from '../types.js';

const target: PublishTarget = {
  id: 'post-pages',
  matches(scope) {
    return (
      scope.allPosts || scope.postSlugs.size > 0 || scope.projectIds.size > 0
    );
  },
  needs: { posts: true, shell: true, projects: true },
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
      artifacts: postsToRender.map((post) =>
        htmlArtifact(
          postPageKey(post.slug),
          renderPostPage(
            shell,
            post,
            postProjectLinks(post.projectIds, projects.projects),
          ),
        ),
      ),
      invalidationPaths: postsToRender.length > 0 ? ['/blog*'] : [],
    };
  },
};

export default target;
