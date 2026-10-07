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
 * Keeps the page, KVS entry, and feed entries of live posts whose PUBLISHED
 * row is corrupt, read back from `blog/posts.json` by id. This also recovers
 * the live slug when the row's own slug is the corrupt field.
 */
export async function retainLivePosts(
  storage: SiteStorage,
  catalog: PublishedPostsCatalog,
): Promise<Post[]> {
  const corruptIds = new Set(catalog.corruptPostIds ?? []);
  if (corruptIds.size === 0) return [];

  const previous = await readPublishedListItems(storage);
  const catalogIds = new Set(catalog.posts.map((p) => p.id));
  const catalogSlugs = new Set(catalog.posts.map((p) => p.slug));
  return previous
    .filter(
      (item) =>
        corruptIds.has(item.id) &&
        !catalogIds.has(item.id) &&
        !catalogSlugs.has(item.slug),
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

/**
 * Stream shards and `republishAll` run rebuilds in parallel, and each writes
 * every index it touches from the data it read. Every commit that writes or
 * deletes a PUBLISHED row also moves the site publish generation, so a pass
 * that sees the same generation (and shell) before it reads and after it
 * writes rendered from data no commit changed in between; otherwise it runs
 * again. The last write to any index then comes from a pass that read every
 * publish committed before it finished. Invalidation and the KVS syncs run
 * once, after the last pass.
 */
export async function runPublishTargets(
  options: RunOptions,
): Promise<RebuildResult> {
  const scope = options.scope ?? fullRebuildScope();
  const targets = options.targets ?? getPublishTargets();
  const { storage, sources } = options;

  const flags = emptyFlagAccumulator();
  const removedSlugs = new Set<string>();
  const paths: string[] = [];
  let hadChanges = false;
  let publishedCount: number;

  for (let pass = 1; ; pass += 1) {
    const generation = await sources.readGeneration();
    const result = await runPublishPass({ scope, storage, sources, targets });
    PUBLISH_RESULT_BOOLEAN_FLAGS.forEach((key) => {
      if (result.flags[key]) flags[key] = true;
    });
    result.removedSlugs.forEach((slug) => removedSlugs.add(slug));
    paths.push(...result.paths);
    hadChanges ||= result.hadChanges;
    publishedCount = result.publishedCount;

    const changed: string[] = [];
    if ((await sources.readGeneration()) !== generation) {
      changed.push('generation');
    }
    if (
      result.shell !== undefined &&
      (await storage.readShell()) !== result.shell
    ) {
      changed.push('shell');
    }
    if (changed.length === 0) break;
    if (pass === MAX_PUBLISH_PASSES) {
      logger.warn('Published data kept changing during the rebuild', {
        pass,
        changed,
      });
      metrics.addMetric('RebuildUnsettled', MetricUnit.Count, 1);
      break;
    }
    logger.info('Published data changed during the rebuild; rebuilding', {
      pass,
      changed,
    });
  }

  const invalidated = finalizeInvalidationPaths(scope, paths, hadChanges);

  // Invalidate before KVS sync so a sync failure still clears cache. Both
  // allowlists are the pages in storage, listed inside the sync after its
  // ETag read, so a page another rebuild wrote meanwhile is never dropped and
  // kept pages of corrupt rows stay reachable.
  await storage.invalidate(invalidated);

  if (scope.feeds) {
    await syncViewerRequestBlogSlugs(async () =>
      postSlugsFromKeys(await storage.list('blog/')),
    );
  }

  if (scopeNeedsProjects(targets, scope)) {
    await syncViewerRequestProjectSlugs(async () =>
      projectSlugsFromKeys(await storage.list('projects/')),
    );
  }

  return {
    publishedCount,
    removedSlugs: [...removedSlugs],
    ...flags,
    invalidated,
  };
}

type PassResult = {
  publishedCount: number;
  removedSlugs: string[];
  flags: FlagAccumulator;
  paths: string[];
  hadChanges: boolean;
  /** The shell the pass rendered with, when it read one. */
  shell: string | undefined;
};

async function runPublishPass(options: {
  scope: RebuildScope;
  storage: SiteStorage;
  sources: RebuildSiteSources;
  targets: readonly PublishTarget[];
}): Promise<PassResult> {
  const { scope, storage, sources, targets } = options;

  const activeTargets = targets.filter((t) => t.matches(scope));

  const needsCatalog = scopeNeedsCatalog(targets, scope);
  const needsShell = scopeNeedsShell(targets, scope);

  const shell = needsShell ? await storage.readShell() : undefined;
  const catalog = needsCatalog
    ? await sources.listPublishedPosts()
    : { posts: [], corruptSlugs: [] as string[] };
  const published = catalog.posts;
  const retainedPosts = needsCatalog
    ? await retainLivePosts(storage, catalog)
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
    shell: shell ?? '',
    storage,
    sources,
    published,
    corruptPostSlugs,
    retainedPosts,
    projects,
  };

  const flags = emptyFlagAccumulator();
  const removedSlugs: string[] = [];
  const paths: string[] = [];
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
        paths.push(...result.invalidationPaths);
      }
    }
  }

  return {
    publishedCount: published.length,
    removedSlugs,
    flags,
    paths,
    hadChanges,
    shell,
  };
}
