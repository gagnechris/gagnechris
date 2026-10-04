import type { Post } from '@gagnechris/shared';
import {
  isFullRebuildScope,
  fullRebuildScope,
  type RebuildScope,
} from '../rebuild-scope.js';
import { mapWithConcurrency, PUT_CONCURRENCY } from '../concurrency.js';
import { listItemToFeedPost, readPublishedListItems } from '../posts.js';
import type { RebuildResult } from '../rebuild-result.js';
import {
  postSlugsFromKeys,
  projectSlugsFromKeys,
  type SiteStorage,
} from '../storage.js';
import {
  syncViewerRequestBlogSlugs,
  syncViewerRequestProjectSlugs,
} from '../viewer-request-slugs.js';
import { getPublishTargets } from './registry.js';
import type {
  PublishArtifact,
  PublishTarget,
  PublishTargetContext,
  PublishTargetRunResult,
  PublishedPostsCatalog,
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

function scopeNeedsProjects(
  targets: readonly PublishTarget[],
  scope: RebuildScope,
): boolean {
  return targets.some((t) => t.matches(scope) && t.needsProjects?.(scope));
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

export function finalizeInvalidationPaths(
  scope: RebuildScope,
  paths: string[],
  hadChanges: boolean,
): string[] {
  if (!hadChanges) return [];
  if (isFullRebuildScope(scope)) return ['/*'];
  return [...new Set(paths)];
}

/**
 * Keeps the page, KVS entry, and feed entries of live posts missing from the
 * catalog:
 * - corrupt PUBLISHED rows (any rebuild), which also recovers the live slug
 *   when the row's own slug is the corrupt field;
 * - stream rebuilds only: GSI lag. Full rebuilds trust the catalog otherwise.
 */
export async function retainLivePosts(
  storage: SiteStorage,
  scope: RebuildScope,
  catalog: PublishedPostsCatalog,
): Promise<Post[]> {
  const corruptIds = new Set(catalog.corruptPostIds ?? []);
  const full = isFullRebuildScope(scope);
  if (full && corruptIds.size === 0) return [];

  const previous = await readPublishedListItems(storage);
  if (previous.length === 0) return [];

  const catalogIds = new Set(catalog.posts.map((p) => p.id));
  const catalogSlugs = new Set(catalog.posts.map((p) => p.slug));
  const missing = previous.filter(
    (item) => !catalogIds.has(item.id) && !catalogSlugs.has(item.slug),
  );
  const lagging = full
    ? []
    : missing.filter(
        (item) =>
          !corruptIds.has(item.id) && !scope.slugsToRemove.has(item.slug),
      );
  const livePages =
    lagging.length > 0
      ? new Set(postSlugsFromKeys(await storage.list('blog/')))
      : new Set<string>();

  return missing
    .filter(
      (item) =>
        corruptIds.has(item.id) ||
        (lagging.includes(item) && livePages.has(item.slug)),
    )
    .map(listItemToFeedPost);
}

export async function runPublishTargets(options: {
  scope?: RebuildScope;
  storage: SiteStorage;
  sources: RebuildSiteSources;
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
  const retainedPosts = needsCatalog
    ? await retainLivePosts(storage, scope, catalog)
    : [];
  const needsProjects = scopeNeedsProjects(targets, scope);
  const projects = needsProjects
    ? await sources.listPublishedProjects()
    : { projects: [], corruptSlugs: [] };
  const corruptPostSlugs = new Set([
    ...catalog.corruptSlugs,
    ...retainedPosts.map((p) => p.slug),
  ]);

  const ctx: PublishTargetContext = {
    scope,
    shell,
    storage,
    sources,
    published,
    corruptPostSlugs,
    retainedPosts,
    projects,
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

  // Invalidate before KVS sync so a sync failure still clears cache. The
  // allowlist is the in-memory catalog (posts ∪ corrupt) so corrupt slugs
  // stay reachable and reads cannot diverge.
  await storage.invalidate(invalidated);

  if (scope.feeds) {
    const desiredSlugs = [...published.map((p) => p.slug), ...corruptPostSlugs];
    await syncViewerRequestBlogSlugs(desiredSlugs);
  }

  if (needsProjects) {
    // The pages in storage after this run's writes and deletes, so href
    // cards and body-less ideas (no page) stay out and kept pages of corrupt
    // rows stay in.
    await syncViewerRequestProjectSlugs(async () =>
      projectSlugsFromKeys(await storage.list('projects/')),
    );
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
