import { sitePostJsonKey } from '@gagnechris/shared';
import { POSTS_PATH, postCanonicalUrl } from '../../render.js';
import { postPageKey, postSlugsFromKeys } from '../../storage.js';
import { redirectArtifact } from '../artifacts.js';
import type { PublishArtifact, PublishTarget } from '../types.js';

const target: PublishTarget = {
  id: 'post-orphans',
  s3Outputs: ['blog/*'],
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
    const { scope, storage, sources, published, corruptPostSlugs } = ctx;
    const publishedSlugs = new Set(published.map((p) => p.slug));
    const slugById = new Map(published.map((p) => [p.id, p.slug]));

    // A post that leaves may own redirect pages at its earlier slugs, which
    // only a scan of every page finds.
    const candidates = new Set(scope.slugsToRemove);
    if (scope.allPosts || scope.slugsToRemove.size > 0) {
      for (const slug of postSlugsFromKeys(await storage.list('blog/'))) {
        candidates.add(slug);
      }
    }

    const artifacts: PublishArtifact[] = [];
    const deleteKeys: string[] = [];
    for (const slug of candidates) {
      if (!slug || publishedSlugs.has(slug) || corruptPostSlugs.has(slug)) {
        continue;
      }
      const owner = await sources.slugRedirectOwner('post', slug);
      const target = owner === undefined ? undefined : slugById.get(owner);
      if (target) {
        artifacts.push(
          redirectArtifact(
            postPageKey(slug),
            `${POSTS_PATH}/${target}`,
            postCanonicalUrl(target),
          ),
        );
        deleteKeys.push(sitePostJsonKey(slug));
        continue;
      }
      deleteKeys.push(postPageKey(slug), sitePostJsonKey(slug));
    }
    return {
      artifacts,
      deleteKeys,
      invalidationPaths: ['/blog*', '/rss.xml'],
    };
  },
};

export default target;
