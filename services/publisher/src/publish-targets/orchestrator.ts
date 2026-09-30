import {
  isFullRebuildScope,
  fullRebuildScope,
  type RebuildScope,
} from '../rebuild-scope.js';
import { mapWithConcurrency, PUT_CONCURRENCY } from '../concurrency.js';
import type { RebuildResult } from '../rebuild-result.js';
import type { SiteStorage } from '../storage.js';
import { syncViewerRequestBlogSlugs } from '../viewer-request-slugs.js';
import { getPublishTargets } from './registry.js';
import type {
  PublishArtifact,
  PublishTarget,
  PublishTargetContext,
  RebuildSiteSources,
} from './types.js';

function scopeNeedsCatalog(
  targets: readonly PublishTarget[],
  scope: RebuildScope,
): boolean {
  return targets.some((t) => t.matches(scope) && t.needsCatalog(scope));
}

function scopeNeedsShell(
  targets: readonly PublishTarget[],
  scope: RebuildScope,
): boolean {
  return targets.some((t) => t.matches(scope) && t.needsShell(scope));
}

async function writeArtifacts(
  storage: SiteStorage,
  artifacts: PublishArtifact[],
): Promise<string[]> {
  const written: string[] = [];
  await mapWithConcurrency(artifacts, PUT_CONCURRENCY, async (artifact) => {
    const wrote = await storage.put(
      artifact.key,
      artifact.body,
      artifact.contentType,
      artifact.cacheControl,
      artifact.contentDisposition,
    );
    if (wrote) written.push(artifact.key);
  });
  return written;
}

async function deleteKeys(
  storage: SiteStorage,
  keys: string[],
): Promise<string[]> {
  for (const key of keys) {
    await storage.delete(key);
  }
  return keys;
}

/**
 * Collapse target-owned invalidation paths. Full rebuild → `/*`.
 * Empty when nothing was written or deleted (hash-skip).
 */
export function finalizeInvalidationPaths(
  scope: RebuildScope,
  paths: string[],
  hadChanges: boolean,
): string[] {
  if (!hadChanges) return [];
  if (isFullRebuildScope(scope)) return ['/*'];
  return [...new Set(paths)];
}

export async function runPublishTargets(options: {
  scope?: RebuildScope;
  storage: SiteStorage;
  sources: RebuildSiteSources;
  /** Override production registry (tests / AC demos). */
  targets?: readonly PublishTarget[];
}): Promise<RebuildResult> {
  const scope = options.scope ?? fullRebuildScope();
  const { storage, sources } = options;
  const targets = options.targets ?? getPublishTargets();

  const activeTargets = targets.filter((t) => t.matches(scope));

  const needsCatalog = scopeNeedsCatalog(targets, scope);
  const needsShell = scopeNeedsShell(targets, scope);

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
  const collectedPaths: string[] = [];
  let hadChanges = false;

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

    const written = result.artifacts?.length
      ? await writeArtifacts(storage, result.artifacts)
      : [];
    const deleted = result.deleteKeys?.length
      ? await deleteKeys(storage, result.deleteKeys)
      : [];

    if (
      written.length > 0 ||
      deleted.length > 0 ||
      (result.removedSlugs?.length ?? 0) > 0
    ) {
      hadChanges = true;
      if (result.invalidationPaths?.length) {
        collectedPaths.push(...result.invalidationPaths);
      }
    }
  }

  const invalidated = finalizeInvalidationPaths(
    scope,
    collectedPaths,
    hadChanges,
  );

  // Invalidate before KVS sync so a sync failure still clears cache (CHR-123).
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
    invalidated,
  };
}
