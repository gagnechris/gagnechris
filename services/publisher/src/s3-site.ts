import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  GSI1_NAME,
  SK_META,
  getDocClient,
  keys,
  metaToHome,
  metaToPost,
  metaToProject,
  metaToResume,
  parseHomeMetaItem,
  parsePostMetaItem,
  parseProjectMetaItem,
  parseResumeMetaItem,
  parseSitePublishItem,
  projectStatusGsi1Pk,
  statusGsi1Pk,
  type PostMetaItem,
  type SitePublishState,
} from '@gagnechris/data';
import { batchGetAllWithDocClient } from '@gagnechris/data';
import {
  sortProjectsByOrder,
  type Home,
  type Post,
  type Project,
  type Resume,
} from '@gagnechris/shared';
import { requireEnv, siteStorageMode } from './config.js';
import { logger, metrics } from './observability.js';
import { sortPostsNewestFirst } from './posts.js';
import { runPublishTargets } from './publish-targets/orchestrator.js';
import type {
  PublishedLookup,
  PublishedPostsCatalog,
  PublishedProjectsCatalog,
  PublishTarget,
  RebuildSiteSources,
} from './publish-targets/types.js';
import { fullRebuildScope, type RebuildScope } from './rebuild-scope.js';
import type { RebuildResult } from './rebuild-result.js';
import { createFilesystemSiteStorage } from './storage-fs.js';
import { createS3SiteStorage } from './storage-s3.js';
import type { SiteStorage } from './storage.js';

const ddb = getDocClient();

export type { HomePublishSnapshot } from './home-publish.js';
export {
  HOME_LAST_PUBLISHED_KEY,
  homeToSnapshot,
  readHomePublishSnapshot,
  snapshotToHome,
} from './home-publish.js';
export type { RebuildResult } from './rebuild-result.js';

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

// The overlap check compares catalogs by JSON, so BatchGet's arbitrary
// response order must not leak into them.
const sortedUnique = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

function logCorruptPublished(opts: {
  label: string;
  pk?: string;
  sk?: string;
  err: unknown;
}): void {
  logger.warn(`Skipping corrupt published ${opts.label} item`, {
    pk: opts.pk,
    sk: opts.sk,
    errMessage: opts.err instanceof Error ? opts.err.message : String(opts.err),
  });
  metrics.addMetric('DataIntegrityError', MetricUnit.Count, 1);
}

export async function getSitePublishState(
  tableName: string,
): Promise<SitePublishState> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.sitePublish(),
      ConsistentRead: true,
    }),
  );
  return parseSitePublishItem(result.Item);
}

/**
 * Ids from GSI1 and from the site publish row, then the PUBLISHED rows. The
 * row is read consistently, so a just-published post is listed however far
 * GSI1 lags; GSI1 still lists posts published before the row tracked them.
 */
export async function listPublishedPosts(
  tableName: string,
): Promise<PublishedPostsCatalog> {
  const state = await getSitePublishState(tableName);
  const posts: Post[] = [];
  const corruptSlugs: string[] = [];
  const metaPostIds: string[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': statusGsi1Pk('published') },
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of page.Items ?? []) {
      if (item.entityType !== 'post') continue;
      // PUBLISHED rows are not on gsi1 (no gsi1pk). The index returns published
      // META drafts; load PUBLISHED snapshots via BatchGet.
      if (item.sk === SK_META && typeof item.postId === 'string') {
        metaPostIds.push(item.postId);
      }
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const uniqueIds = [...new Set([...metaPostIds, ...state.postIds])];
  const publishedById = new Map<string, PostMetaItem>();
  const corruptPostIds = new Set<string>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    const responses = await batchGetAllWithDocClient(
      async (RequestItems) => ddb.send(new BatchGetCommand({ RequestItems })),
      {
        [tableName]: {
          Keys: chunk.map((postId) => keys.post.published(postId)),
          ConsistentRead: true,
        },
      },
    );
    for (const item of responses[tableName] ?? []) {
      const pk =
        typeof (item as { pk?: unknown }).pk === 'string'
          ? (item as { pk: string }).pk
          : undefined;
      const sk =
        typeof (item as { sk?: unknown }).sk === 'string'
          ? (item as { sk: string }).sk
          : undefined;
      const postId =
        typeof (item as { postId?: unknown }).postId === 'string'
          ? (item as { postId: string }).postId
          : pk?.startsWith('POST#')
            ? pk.slice('POST#'.length)
            : undefined;
      try {
        const record = parsePostMetaItem(item);
        publishedById.set(record.postId, record);
      } catch (error) {
        logCorruptPublished({ label: 'post', pk, sk, err: error });
        if (postId) corruptPostIds.add(postId);
        // Only trust the PUBLISHED row's own slug. META may already hold a
        // draft rename, which would protect the wrong path.
        const slug =
          typeof (item as { slug?: unknown }).slug === 'string' &&
          (item as { slug: string }).slug
            ? (item as { slug: string }).slug
            : undefined;
        if (slug) corruptSlugs.push(slug);
      }
    }
  }

  for (const postId of uniqueIds) {
    const publishedItem = publishedById.get(postId);
    // Never synthesize PUBLISHED from a stale META read. Corrupt PUBLISHED
    // rows are tracked separately so orphans are not deleted.
    if (!publishedItem) continue;
    if (corruptPostIds.has(postId)) continue;
    posts.push(metaToPost(publishedItem));
  }

  return {
    posts: sortPostsNewestFirst(posts),
    corruptSlugs: sortedUnique(corruptSlugs),
    corruptPostIds: sortedUnique(corruptPostIds),
  };
}

const stringAttr = (item: unknown, name: string): string | undefined => {
  const value = (item as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : undefined;
};

/** Same shape as {@link listPublishedPosts}: GSI1 and the site publish row for ids, then the PUBLISHED rows. */
export async function listPublishedProjects(
  tableName: string,
): Promise<PublishedProjectsCatalog> {
  const state = await getSitePublishState(tableName);
  const ids: string[] = [...state.projectIds];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: {
          ':pk': projectStatusGsi1Pk('published'),
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of page.Items ?? []) {
      if (item.entityType !== 'project' || item.sk !== SK_META) continue;
      const id = stringAttr(item, 'projectId');
      if (id) ids.push(id);
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const projects: Project[] = [];
  const corruptSlugs: string[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const responses = await batchGetAllWithDocClient(
      async (RequestItems) => ddb.send(new BatchGetCommand({ RequestItems })),
      {
        [tableName]: {
          Keys: chunk.map((id) => keys.project.published(id)),
          ConsistentRead: true,
        },
      },
    );
    for (const item of responses[tableName] ?? []) {
      try {
        const record = parseProjectMetaItem(item);
        if (record.status === 'published') projects.push(metaToProject(record));
      } catch (error) {
        logCorruptPublished({
          label: 'project',
          pk: stringAttr(item, 'pk'),
          sk: stringAttr(item, 'sk'),
          err: error,
        });
        const slug = stringAttr(item, 'slug');
        if (slug) corruptSlugs.push(slug);
      }
    }
  }
  return {
    projects: sortProjectsByOrder(projects),
    corruptSlugs: sortedUnique(corruptSlugs),
  };
}

export async function getPublishedResume(
  tableName: string,
): Promise<PublishedLookup<Resume>> {
  const key = keys.singleton.resume.published();
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: key,
      ConsistentRead: true,
    }),
  );
  if (!result.Item) return { status: 'missing' };
  try {
    const item = parseResumeMetaItem(result.Item);
    if (item.status !== 'published') return { status: 'missing' };
    return { status: 'ok', entity: metaToResume(item) };
  } catch (error) {
    logCorruptPublished({
      label: 'resume',
      pk: typeof result.Item.pk === 'string' ? result.Item.pk : key.pk,
      sk: typeof result.Item.sk === 'string' ? result.Item.sk : key.sk,
      err: error,
    });
    return { status: 'corrupt' };
  }
}

export async function getPublishedHome(
  tableName: string,
): Promise<PublishedLookup<Home>> {
  const key = keys.singleton.home.published();
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: key,
      ConsistentRead: true,
    }),
  );
  if (!result.Item) return { status: 'missing' };
  try {
    const item = parseHomeMetaItem(result.Item);
    if (item.status !== 'published') return { status: 'missing' };
    return { status: 'ok', entity: metaToHome(item) };
  } catch (error) {
    logCorruptPublished({
      label: 'home',
      pk: typeof result.Item.pk === 'string' ? result.Item.pk : key.pk,
      sk: typeof result.Item.sk === 'string' ? result.Item.sk : key.sk,
      err: error,
    });
    return { status: 'corrupt' };
  }
}

export type { RebuildSiteSources } from './publish-targets/types.js';

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
  const scope = options?.scope ?? fullRebuildScope();
  const storage = options?.storage ?? getSiteStorage();
  const sources: RebuildSiteSources =
    options?.sources ??
    (() => {
      const tableName = requireEnv('DATA_TABLE_NAME');
      return {
        readGeneration: async () =>
          (await getSitePublishState(tableName)).generation,
        listPublishedPosts: () => listPublishedPosts(tableName),
        listPublishedProjects: () => listPublishedProjects(tableName),
        getPublishedResume: () => getPublishedResume(tableName),
        getPublishedHome: () => getPublishedHome(tableName),
      };
    })();

  return runPublishTargets({
    scope,
    storage,
    sources,
    targets: options?.targets,
  });
}
