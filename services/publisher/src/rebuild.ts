import {
  getPublishedHome,
  getPublishedResume,
  getSitePublishState,
  listPublishedPosts,
  listPublishedProjects,
} from './catalog.js';
import { requireEnv, siteStorageMode } from './config.js';
import { runPublishTargets } from './publish-targets/orchestrator.js';
import type {
  PublishTarget,
  RebuildSiteSources,
} from './publish-targets/types.js';
import { fullRebuildScope, type RebuildScope } from './rebuild-scope.js';
import type { RebuildResult } from './rebuild-result.js';
import { createFilesystemSiteStorage } from './storage-fs.js';
import { createS3SiteStorage } from './storage-s3.js';
import type { SiteStorage } from './storage.js';

let storageOverride: SiteStorage | undefined;

export function setSiteStorage(storage: SiteStorage | undefined): void {
  storageOverride = storage;
}

export function getSiteStorage(): SiteStorage {
  if (storageOverride) return storageOverride;
  return siteStorageMode() === 'filesystem'
    ? createFilesystemSiteStorage()
    : createS3SiteStorage();
}

export function tableSources(tableName: string): RebuildSiteSources {
  return {
    readGeneration: async () =>
      (await getSitePublishState(tableName)).generation,
    listPublishedPosts: () => listPublishedPosts(tableName),
    listPublishedProjects: () => listPublishedProjects(tableName),
    getPublishedResume: () => getPublishedResume(tableName),
    getPublishedHome: () => getPublishedHome(tableName),
  };
}

/**
 * - Corrupt Resume/Post PUBLISHED rows: preserve live artifacts.
 * - Unpublished Home: re-render from `home/last-published.json` so the last
 *   published copy survives web deploys.
 * - Live posts with a corrupt PUBLISHED row keep their page, KVS entry, and
 *   previous feed entry.
 */
export async function rebuildPublishedSite(options?: {
  scope?: RebuildScope;
  storage?: SiteStorage;
  sources?: RebuildSiteSources;
  targets?: readonly PublishTarget[];
}): Promise<RebuildResult> {
  return runPublishTargets({
    scope: options?.scope ?? fullRebuildScope(),
    storage: options?.storage ?? getSiteStorage(),
    sources: options?.sources ?? tableSources(requireEnv('DATA_TABLE_NAME')),
    targets: options?.targets,
  });
}
