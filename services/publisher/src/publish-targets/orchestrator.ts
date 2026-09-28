import './bootstrap.js';
import {
  buildInvalidationPaths,
  fullRebuildScope,
  type RebuildScope,
} from '../rebuild-scope.js';
import { mapWithConcurrency } from '../concurrency.js';
import type { RebuildResult } from '../rebuild-result.js';
import type { SiteStorage } from '../storage.js';
import { syncViewerRequestBlogSlugs } from '../viewer-request-slugs.js';
import { getPublishTargets } from './registry.js';
import type {
  PublishArtifact,
  PublishTargetContext,
  RebuildSiteSources,
} from './types.js';

const PUT_CONCURRENCY = 8;

function scopeNeedsCatalog(scope: RebuildScope): boolean {
  return getPublishTargets().some(
    (t) => t.matches(scope) && t.needsCatalog(scope),
  );
}

function scopeNeedsShell(scope: RebuildScope): boolean {
  return getPublishTargets().some(
    (t) => t.matches(scope) && t.needsShell(scope),
  );
}

async function writeArtifacts(
  storage: SiteStorage,
  artifacts: PublishArtifact[],
): Promise<void> {
  await mapWithConcurrency(artifacts, PUT_CONCURRENCY, async (artifact) => {
    await storage.put(
      artifact.key,
      artifact.body,
      artifact.contentType,
      artifact.cacheControl,
      artifact.contentDisposition,
    );
  });
}

export async function runPublishTargets(options: {
  scope?: RebuildScope;
  storage: SiteStorage;
  changedKeys: string[];
  sources: RebuildSiteSources;
}): Promise<RebuildResult> {
  const scope = options.scope ?? fullRebuildScope();
  const { storage, changedKeys, sources } = options;

  const activeTargets = getPublishTargets().filter((t) => t.matches(scope));

  const needsCatalog = scopeNeedsCatalog(scope);
  const needsShell = scopeNeedsShell(scope);

  const shell = needsShell ? await storage.readShell() : '';
  const published = needsCatalog ? await sources.listPublishedPosts() : [];

  const ctx: PublishTargetContext = {
    scope,
    shell,
    storage,
    sources,
    published,
  };

  let removedSlugs: string[] = [];
  let resumePublished = false;
  let resumeUnpublished = false;
  let resumePdfFailed = false;
  let homePublished = false;
  let homeRestoredFromSnapshot = false;

  for (const target of activeTargets) {
    const result = await target.run(ctx);
    if (result.removedSlugs?.length) {
      removedSlugs = removedSlugs.concat(result.removedSlugs);
    }
    if (result.resumePublished) resumePublished = true;
    if (result.resumeUnpublished) resumeUnpublished = true;
    if (result.resumePdfFailed) resumePdfFailed = true;
    if (result.homePublished) homePublished = true;
    if (result.homeRestoredFromSnapshot) homeRestoredFromSnapshot = true;
    if (result.artifacts?.length) {
      await writeArtifacts(storage, result.artifacts);
    }
    if (result.deleteKeys?.length) {
      for (const key of result.deleteKeys) {
        await storage.delete(key);
      }
    }
  }

  const invalidated = buildInvalidationPaths({
    scope,
    changedKeys,
    removedSlugs,
  });

  await storage.invalidate(invalidated);

  if (scope.feeds) {
    await syncViewerRequestBlogSlugs(() =>
      sources.listPublishedPosts().then((posts) => posts.map((p) => p.slug)),
    );
  }

  return {
    publishedCount: published.length,
    removedSlugs,
    resumePublished,
    resumeUnpublished,
    resumePdfFailed,
    homePublished,
    homeRestoredFromSnapshot,
    invalidated: [...new Set(invalidated)],
  };
}
