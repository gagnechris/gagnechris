import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { Post } from '@gagnechris/shared';
import {
  isFullRebuildScope,
  fullRebuildScope,
  type RebuildScope,
} from '../rebuild-scope.js';
import { mapWithConcurrency, PUT_CONCURRENCY } from '../concurrency.js';
import { logger, metrics } from '../observability.js';
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

type FlagAccumulator = Record<
  (typeof PUBLISH_RESULT_BOOLEAN_FLAGS)[number],
  boolean
>;

function emptyFlagAccumulator(): FlagAccumulator {
  return {
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

type RunOptions = {
  scope?: RebuildScope;
  storage: SiteStorage;
  sources: RebuildSiteSources;
  targets?: readonly PublishTarget[];
};

export const MAX_PUBLISH_PASSES = 4;

/** Wraps sources so the data a pass rendered from can be read again and compared. */
function recordedSources(sources: RebuildSiteSources) {
  const seen = new Map<keyof RebuildSiteSources, string>();
  const recorded = {} as RebuildSiteSources;
  for (const name of Object.keys(sources) as (keyof RebuildSiteSources)[]) {
    recorded[name] = (async () => {
      const value = await sources[name]();
      if (!seen.has(name)) seen.set(name, JSON.stringify(value));
      return value;
    }) as never;
  }
  const changed = async (): Promise<(keyof RebuildSiteSources)[]> => {
    const names = [...seen.keys()];
    const now = await Promise.all(
      names.map(async (name) => JSON.stringify(await sources[name]())),
    );
    return names.filter((name, i) => now[i] !== seen.get(name));
  };
  return { recorded, changed };
}

/**
 * Stream shards and `republishAll` run rebuilds in parallel, and each writes
 * every index it touches from the data it read. One that read before another
 * publish and wrote after it would drop that item, so a pass whose data has
 * changed by the time its writes land runs again. The last write to any
 * index then comes from a pass that read every publish committed before it
 * finished.
 */
export async function runPublishTargets(
  options: RunOptions,
): Promise<RebuildResult> {
  const removedSlugs = new Set<string>();
  const invalidated = new Set<string>();
  for (let pass = 1; ; pass += 1) {
    const { recorded, changed } = recordedSources(options.sources);
    const result = await runPublishPass({ ...options, sources: recorded });
    result.removedSlugs.forEach((slug) => removedSlugs.add(slug));
    result.invalidated.forEach((path) => invalidated.add(path));
    const merged = {
      ...result,
      removedSlugs: [...removedSlugs],
      invalidated: [...invalidated],
    };
    const stale = await changed();
    if (stale.length === 0) return merged;
    if (pass === MAX_PUBLISH_PASSES) {
      logger.warn('Published data kept changing during the rebuild', {
        pass,
        changed: stale,
      });
      metrics.addMetric('RebuildUnsettled', MetricUnit.Count, 1);
      return merged;
    }
    logger.info('Published data changed during the rebuild; rebuilding', {
      pass,
      changed: stale,
    });
  }
}

async function runPublishPass(options: RunOptions): Promise<RebuildResult> {
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
  const removedSlugs: string[] = [];
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

    removedSlugs.push(...postSlugsFromKeys(deleted));

    if (written.length > 0 || deleted.length > 0) {
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
    removedSlugs,
    resumePublished: flags.resumePublished,
    resumeUnpublished: flags.resumeUnpublished,
    resumePdfFailed: flags.resumePdfFailed,
    homePublished: flags.homePublished,
    homeRestoredFromSnapshot: flags.homeRestoredFromSnapshot,
    invalidated,
  };
}
