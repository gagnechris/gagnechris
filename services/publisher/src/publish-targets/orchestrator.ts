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
  PublishTargetRunResult,
  RebuildSiteSources,
} from './types.js';
import { PUBLISH_RESULT_BOOLEAN_FLAGS } from './types.js';

type FlagAccumulator = {
  removedSlugs: string[];
} & Record<(typeof PUBLISH_RESULT_BOOLEAN_FLAGS)[number], boolean>;

function emptyFlagAccumulator(): FlagAccumulator {
  return {
    removedSlugs: [],
    resumePublished: false,
    resumeUnpublished: false,
    resumePdfFailed: false,
    homePublished: false,
    homeRestoredFromSnapshot: false,
  };
}

/** OR-merge boolean flags; concat removedSlugs (CHR-179). */
export function mergeTargetResultFlags(
  acc: FlagAccumulator,
  result: PublishTargetRunResult,
): void {
  if (result.removedSlugs?.length) {
    acc.removedSlugs.push(...result.removedSlugs);
  }
  for (const key of PUBLISH_RESULT_BOOLEAN_FLAGS) {
    if (result[key]) acc[key] = true;
  }
}

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
  const deleted: string[] = [];
  for (const key of keys) {
    if (await storage.delete(key)) {
      deleted.push(key);
    }
  }
  return deleted;
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
  const catalog = needsCatalog
    ? await sources.listPublishedPosts()
    : { posts: [], corruptSlugs: [] as string[] };
  const published = catalog.posts;
  const corruptPostSlugs = new Set(catalog.corruptSlugs);

  const ctx: PublishTargetContext = {
    scope,
    shell,
    storage,
    sources,
    published,
    corruptPostSlugs,
  };

  const flags = emptyFlagAccumulator();
  const collectedPaths: string[] = [];
  let hadChanges = false;

  for (const target of activeTargets) {
    const result = await target.run(ctx);
    mergeTargetResultFlags(flags, result);

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
  // Desired allowlist is the in-memory catalog (posts ∪ corrupt) — list once
  // per rebuild so corrupt slugs stay reachable and reads cannot diverge (CHR-167).
  await storage.invalidate(invalidated);

  if (scope.feeds) {
    const desiredSlugs = [...published.map((p) => p.slug), ...corruptPostSlugs];
    await syncViewerRequestBlogSlugs(desiredSlugs);
  }

  return {
    publishedCount: published.length,
    removedSlugs: flags.removedSlugs,
    resumePublished: flags.resumePublished,
    resumeUnpublished: flags.resumeUnpublished,
    resumePdfFailed: flags.resumePdfFailed,
    homePublished: flags.homePublished,
    homeRestoredFromSnapshot: flags.homeRestoredFromSnapshot,
    invalidated,
  };
}
