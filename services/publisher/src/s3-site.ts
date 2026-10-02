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
  metaToResume,
  parseHomeMetaItem,
  parsePostMetaItem,
  parseResumeMetaItem,
  statusGsi1Pk,
  type PostMetaItem,
} from '@gagnechris/data';
import { batchGetAllWithDocClient } from '@gagnechris/data';
import type { Home, Post, Resume } from '@gagnechris/shared';
import { requireEnv, siteStorageMode } from './config.js';
import { logger, metrics } from './observability.js';
import { runPublishTargets } from './publish-targets/orchestrator.js';
import type {
  PublishedLookup,
  PublishedPostsCatalog,
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

/** Test / local harness hook. */
export function setSiteStorage(storage: SiteStorage | undefined): void {
  storageOverride = storage;
}

export function getSiteStorage(): SiteStorage {
  if (storageOverride) return storageOverride;
  return siteStorageMode() === 'filesystem'
    ? createFilesystemSiteStorage()
    : createS3SiteStorage();
}

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

export async function listPublishedPosts(
  tableName: string,
): Promise<PublishedPostsCatalog> {
  const posts: Post[] = [];
  const corruptSlugs: string[] = [];
  const metaPostIds: string[] = [];
  const metaSlugById = new Map<string, string>();
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
      // META drafts; load PUBLISHED snapshots via BatchGet (CHR-117).
      if (item.sk === SK_META && typeof item.postId === 'string') {
        metaPostIds.push(item.postId);
        if (typeof item.slug === 'string' && item.slug) {
          metaSlugById.set(item.postId, item.slug);
        }
      }
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const uniqueIds = [...new Set(metaPostIds)];
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
        const slug =
          typeof (item as { slug?: unknown }).slug === 'string'
            ? (item as { slug: string }).slug
            : postId
              ? metaSlugById.get(postId)
              : undefined;
        if (slug) corruptSlugs.push(slug);
      }
    }
  }

  for (const postId of uniqueIds) {
    const publishedItem = publishedById.get(postId);
    // Skip META-only rows: never synthesize PUBLISHED from a stale META read (CHR-146).
    // Corrupt PUBLISHED rows are tracked separately so orphans are not deleted (CHR-160).
    if (!publishedItem) continue;
    if (corruptPostIds.has(postId)) continue;
    posts.push(metaToPost(publishedItem));
  }

  return {
    posts: posts.sort((a, b) => {
      const aTs = a.publishedAt ?? a.updatedAt;
      const bTs = b.publishedAt ?? b.updatedAt;
      return bTs.localeCompare(aTs);
    }),
    corruptSlugs: [...new Set(corruptSlugs)],
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
 * Rebuild published static artifacts from DynamoDB + the site shell.
 *
 * Pass `scope` to limit work (stream path). Omit scope (or pass
 * `fullRebuildScope()`) for republish-all / local full rebuilds.
 *
 * - Unpublished Resume: replace `resume/index.html` with a placeholder and
 *   delete `resume.pdf` (CHR-103).
 * - Corrupt Resume/Post PUBLISHED rows: preserve live artifacts (CHR-160).
 * - Unpublished Home: re-render `index.html` from `home/last-published.json` so
 *   the last published copy survives web deploys (CHR-103).
 * - Shell is always the pristine `_shell.html` template (CHR-104).
 */
export async function rebuildPublishedSite(options?: {
  scope?: RebuildScope;
  storage?: SiteStorage;
  sources?: RebuildSiteSources;
}): Promise<RebuildResult> {
  const scope = options?.scope ?? fullRebuildScope();
  const tableName = requireEnv('DATA_TABLE_NAME');
  const storage = options?.storage ?? getSiteStorage();
  const sources: RebuildSiteSources = options?.sources ?? {
    listPublishedPosts: () => listPublishedPosts(tableName),
    getPublishedResume: () => getPublishedResume(tableName),
    getPublishedHome: () => getPublishedHome(tableName),
  };

  return runPublishTargets({
    scope,
    storage,
    sources,
  });
}
