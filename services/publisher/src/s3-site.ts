import {
  BatchGetCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  GSI1_NAME,
  SK_META,
  SK_PUBLISHED,
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
import { batchGetAllWithDocClient } from '@gagnechris/shared/server';
import type { Home, Post, Resume } from '@gagnechris/shared';
import { requireEnv, siteStorageMode } from './config.js';
import { runPublishTargets } from './publish-targets/orchestrator.js';
import type { RebuildSiteSources } from './publish-targets/types.js';
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

/** Best-effort write of a PUBLISHED snapshot; never fail the rebuild on Put. */
async function putPublishedSnapshot(
  tableName: string,
  item: Record<string, unknown>,
): Promise<void> {
  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  } catch (err) {
    const name = (err as { name?: string }).name;
    // ConditionalCheckFailedException: already migrated. AccessDenied: IAM lag.
    if (name === 'ConditionalCheckFailedException') return;
    console.warn('PUBLISHED snapshot write skipped', { name, pk: item.pk });
  }
}

export async function listPublishedPosts(tableName: string): Promise<Post[]> {
  const posts: Post[] = [];
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
      // META drafts; load PUBLISHED snapshots via BatchGet (CHR-117).
      if (item.sk === SK_META && typeof item.postId === 'string') {
        metaPostIds.push(item.postId);
      }
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  const uniqueIds = [...new Set(metaPostIds)];
  const publishedById = new Map<string, PostMetaItem>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    const responses = await batchGetAllWithDocClient(
      async (RequestItems) => ddb.send(new BatchGetCommand({ RequestItems })),
      {
        [tableName]: {
          Keys: chunk.map((postId) => keys.post.published(postId)),
        },
      },
    );
    for (const item of responses[tableName] ?? []) {
      const record = parsePostMetaItem(item);
      publishedById.set(record.postId, record);
    }
  }

  for (const postId of uniqueIds) {
    const publishedItem = publishedById.get(postId);
    if (publishedItem) {
      posts.push(metaToPost(publishedItem));
      continue;
    }

    // Rollout safety: copy published META → PUBLISHED when snapshot is missing.
    const legacy = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: keys.post.meta(postId),
      }),
    );
    if (!legacy.Item) continue;
    const legacyItem = parsePostMetaItem(legacy.Item);
    if (legacyItem.status !== 'published') {
      continue;
    }
    const { gsi1pk: _g1, gsi1sk: _g2, ...rest } = legacyItem;
    await putPublishedSnapshot(tableName, {
      ...rest,
      sk: SK_PUBLISHED,
      status: 'published',
    });
    posts.push(metaToPost(legacyItem));
  }

  return posts.sort((a, b) => {
    const aTs = a.publishedAt ?? a.updatedAt;
    const bTs = b.publishedAt ?? b.updatedAt;
    return bTs.localeCompare(aTs);
  });
}

export async function getPublishedResume(
  tableName: string,
): Promise<Resume | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.singleton.resume.published(),
    }),
  );
  if (result.Item) {
    const item = parseResumeMetaItem(result.Item);
    if (item.status === 'published') {
      return metaToResume(item);
    }
  }

  // Rollout safety: copy legacy META → PUBLISHED without changing live content.
  const legacy = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.singleton.resume.meta(),
    }),
  );
  if (!legacy.Item) return undefined;
  const legacyItem = parseResumeMetaItem(legacy.Item);
  if (legacyItem.status !== 'published') {
    return undefined;
  }
  const resume = metaToResume(legacyItem);
  await putPublishedSnapshot(tableName, {
    ...legacyItem,
    sk: SK_PUBLISHED,
    status: 'published',
  });
  return resume;
}

export async function getPublishedHome(
  tableName: string,
): Promise<Home | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.singleton.home.published(),
    }),
  );
  if (result.Item) {
    const item = parseHomeMetaItem(result.Item);
    if (item.status === 'published') {
      return metaToHome(item);
    }
  }

  // Rollout safety: copy legacy META → PUBLISHED without changing live content.
  const legacy = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: keys.singleton.home.meta(),
    }),
  );
  if (!legacy.Item) return undefined;
  const legacyItem = parseHomeMetaItem(legacy.Item);
  if (legacyItem.status !== 'published') {
    return undefined;
  }
  const home = metaToHome(legacyItem);
  await putPublishedSnapshot(tableName, {
    ...legacyItem,
    sk: SK_PUBLISHED,
    status: 'published',
  });
  return home;
}

export type { RebuildSiteSources } from './publish-targets/types.js';

function trackingStorage(inner: SiteStorage): {
  storage: SiteStorage;
  changedKeys: string[];
} {
  const changedKeys: string[] = [];
  return {
    changedKeys,
    storage: {
      readShell: () => inner.readShell(),
      read: (key) => inner.read(key),
      list: (prefix) => inner.list(prefix),
      invalidate: (paths) => inner.invalidate(paths),
      async put(key, body, contentType, cacheControl, contentDisposition) {
        const wrote = await inner.put(
          key,
          body,
          contentType,
          cacheControl,
          contentDisposition,
        );
        if (wrote) changedKeys.push(key);
        return wrote;
      },
      async delete(key) {
        await inner.delete(key);
        changedKeys.push(key);
      },
    },
  };
}

/**
 * Rebuild published static artifacts from DynamoDB + the site shell.
 *
 * Pass `scope` to limit work (stream path). Omit scope (or pass
 * `fullRebuildScope()`) for republish-all / local full rebuilds.
 *
 * - Unpublished Resume: replace `resume/index.html` with a placeholder and
 *   delete `resume.pdf` (CHR-103).
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
  const { storage, changedKeys } = trackingStorage(
    options?.storage ?? getSiteStorage(),
  );
  const sources: RebuildSiteSources = options?.sources ?? {
    listPublishedPosts: () => listPublishedPosts(tableName),
    getPublishedResume: () => getPublishedResume(tableName),
    getPublishedHome: () => getPublishedHome(tableName),
  };

  return runPublishTargets({
    scope,
    storage,
    changedKeys,
    sources,
  });
}
