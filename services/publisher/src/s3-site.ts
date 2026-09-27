import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { requireEnv, siteStorageMode } from './config.js';
import { mapWithConcurrency } from './concurrency.js';
import {
  metaToPost,
  type PostMetaRecord,
  toListItem,
} from './posts.js';
import { metaToHome, type HomeMetaRecord } from './home.js';
import { metaToResume, type ResumeMetaRecord } from './resume.js';
import {
  buildInvalidationPaths,
  fullRebuildScope,
  type RebuildScope,
} from './rebuild-scope.js';
import {
  buildRssXml,
  buildSitemapXml,
  renderBlogIndexPage,
  renderHomePage,
  renderPostPage,
  renderResumePage,
  renderResumeUnavailablePage,
} from './render.js';
import { RESUME_PDF_KEY } from './resume-pdf.js';
import { publishResumePdf } from './resume-pdf-publish.js';
import { createFilesystemSiteStorage } from './storage-fs.js';
import { createS3SiteStorage } from './storage-s3.js';
import { postSlugsFromKeys, type SiteStorage } from './storage.js';
import { syncViewerRequestBlogSlugs } from './viewer-request-slugs.js';
import type { Home, Post, Resume } from '@gagnechris/shared';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const CACHE_HTML = 'public,max-age=0,must-revalidate';
const CACHE_FEED = 'public,max-age=300';
/** Cap parallel S3/filesystem puts so Lambda stays polite under load. */
const PUT_CONCURRENCY = 8;

/**
 * Publisher-owned snapshot of the last successfully published Home.
 * Survives web deploys (excluded from s3 sync) so unpublished Home can be
 * re-injected into a fresh Vite shell instead of falling back to DEFAULT_HOME.
 */
export const HOME_LAST_PUBLISHED_KEY = 'home/last-published.json';

export type HomePublishSnapshot = Pick<
  Home,
  'name' | 'title' | 'about' | 'seo' | 'publishedAt' | 'updatedAt'
>;

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
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': 'STATUS#published' },
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of page.Items ?? []) {
      if (item.entityType !== 'post') continue;
      // PUBLISHED rows are not on gsi1 (no gsi1pk). The index returns published
      // META drafts; load PUBLISHED snapshots via BatchGet (CHR-117).
      if (item.sk === 'META' && typeof item.postId === 'string') {
        metaPostIds.push(item.postId);
      }
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  const uniqueIds = [...new Set(metaPostIds)];
  const publishedById = new Map<string, PostMetaRecord>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    const result = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: chunk.map((postId) => ({
              pk: `POST#${postId}`,
              sk: 'PUBLISHED',
            })),
          },
        },
      }),
    );
    for (const item of result.Responses?.[tableName] ?? []) {
      const record = item as PostMetaRecord;
      if (typeof record.postId === 'string') {
        publishedById.set(record.postId, record);
      }
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
        Key: { pk: `POST#${postId}`, sk: 'META' },
      }),
    );
    const legacyItem = legacy.Item as PostMetaRecord | undefined;
    if (
      !legacyItem ||
      legacyItem.entityType !== 'post' ||
      legacyItem.status !== 'published'
    ) {
      continue;
    }
    const { gsi1pk: _g1, gsi1sk: _g2, ...rest } = legacyItem as PostMetaRecord & {
      gsi1pk?: string;
      gsi1sk?: string;
    };
    await putPublishedSnapshot(tableName, {
      ...rest,
      sk: 'PUBLISHED',
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
      Key: { pk: 'RESUME#current', sk: 'PUBLISHED' },
    }),
  );
  const item = result.Item as ResumeMetaRecord | undefined;
  if (item && item.entityType === 'resume' && item.status === 'published') {
    return metaToResume(item);
  }

  // Rollout safety: copy legacy META → PUBLISHED without changing live content.
  const legacy = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'RESUME#current', sk: 'META' },
    }),
  );
  const legacyItem = legacy.Item as ResumeMetaRecord | undefined;
  if (
    !legacyItem ||
    legacyItem.entityType !== 'resume' ||
    legacyItem.status !== 'published'
  ) {
    return undefined;
  }
  const resume = metaToResume(legacyItem);
  await putPublishedSnapshot(tableName, {
    ...legacyItem,
    sk: 'PUBLISHED',
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
      Key: { pk: 'HOME#current', sk: 'PUBLISHED' },
    }),
  );
  const item = result.Item as HomeMetaRecord | undefined;
  if (item && item.entityType === 'home' && item.status === 'published') {
    return metaToHome(item);
  }

  // Rollout safety: copy legacy META → PUBLISHED without changing live content.
  const legacy = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'HOME#current', sk: 'META' },
    }),
  );
  const legacyItem = legacy.Item as HomeMetaRecord | undefined;
  if (
    !legacyItem ||
    legacyItem.entityType !== 'home' ||
    legacyItem.status !== 'published'
  ) {
    return undefined;
  }
  const home = metaToHome(legacyItem);
  await putPublishedSnapshot(tableName, {
    ...legacyItem,
    sk: 'PUBLISHED',
    status: 'published',
  });
  return home;
}

export function homeToSnapshot(home: Home): HomePublishSnapshot {
  return {
    name: home.name,
    title: home.title,
    about: home.about,
    seo: home.seo,
    publishedAt: home.publishedAt,
    updatedAt: home.updatedAt,
  };
}

export function snapshotToHome(snapshot: HomePublishSnapshot): Home {
  return {
    ...snapshot,
    status: 'published',
    version: 0,
    hasUnpublishedChanges: false,
  };
}

export async function readHomePublishSnapshot(
  storage: SiteStorage,
): Promise<HomePublishSnapshot | undefined> {
  const raw = await storage.read(HOME_LAST_PUBLISHED_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<HomePublishSnapshot>;
    if (
      typeof parsed.name !== 'string' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.about !== 'string'
    ) {
      return undefined;
    }
    return {
      name: parsed.name,
      title: parsed.title,
      about: parsed.about,
      seo: parsed.seo ?? null,
      publishedAt: parsed.publishedAt ?? null,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return undefined;
  }
}

export type RebuildResult = {
  publishedCount: number;
  removedSlugs: string[];
  resumePublished: boolean;
  /** True when resume was draft/missing and live artifacts were cleared/replaced. */
  resumeUnpublished: boolean;
  /** True when resume HTML was published but PDF generation failed (last good PDF kept). */
  resumePdfFailed: boolean;
  homePublished: boolean;
  /** True when Home is draft/missing but last-published snapshot was restored. */
  homeRestoredFromSnapshot: boolean;
  invalidated: string[];
};

export type RebuildSiteSources = {
  listPublishedPosts: () => Promise<Post[]>;
  getPublishedResume: () => Promise<Resume | undefined>;
  getPublishedHome: () => Promise<Home | undefined>;
};

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

  const needsCatalog =
    scope.allPosts ||
    scope.feeds ||
    scope.postSlugs.size > 0 ||
    scope.slugsToRemove.size > 0;

  const needsShell =
    needsCatalog || scope.home || scope.resume || scope.allPosts;

  // Pristine Vite shell (_shell.html) — never the home prerender in index.html.
  const shell = needsShell ? await storage.readShell() : '';

  const published = needsCatalog ? await sources.listPublishedPosts() : [];
  const publishedSlugs = new Set(published.map((p) => p.slug));

  let candidates: Iterable<string>;
  if (scope.allPosts && scope.slugsToRemove.size === 0) {
    const keys = await storage.list('blog/');
    candidates = postSlugsFromKeys(keys);
  } else {
    candidates = scope.slugsToRemove;
  }

  const removedSlugs: string[] = [];
  for (const slug of candidates) {
    if (!slug || publishedSlugs.has(slug)) continue;
    await storage.delete(`blog/${slug}/index.html`);
    removedSlugs.push(slug);
  }

  const postsToRender = scope.allPosts
    ? published
    : published.filter((p) => scope.postSlugs.has(p.slug));

  await mapWithConcurrency(postsToRender, PUT_CONCURRENCY, async (post) => {
    const html = renderPostPage(shell, post);
    await storage.put(
      `blog/${post.slug}/index.html`,
      html,
      'text/html; charset=utf-8',
      CACHE_HTML,
    );
  });

  if (scope.feeds) {
    const feedPuts: Array<() => Promise<boolean>> = [
      () =>
        storage.put(
          'blog/index.html',
          renderBlogIndexPage(shell, published),
          'text/html; charset=utf-8',
          CACHE_HTML,
        ),
      () =>
        storage.put(
          'blog/posts.json',
          JSON.stringify({ items: published.map(toListItem) }, null, 0),
          'application/json; charset=utf-8',
          CACHE_HTML,
        ),
      () =>
        storage.put(
          'blog/slugs.json',
          JSON.stringify({ slugs: published.map((p) => p.slug) }, null, 0),
          'application/json; charset=utf-8',
          CACHE_HTML,
        ),
      () =>
        storage.put(
          'sitemap.xml',
          buildSitemapXml(published),
          'application/xml; charset=utf-8',
          CACHE_FEED,
        ),
      () =>
        storage.put(
          'rss.xml',
          buildRssXml(published),
          'application/rss+xml; charset=utf-8',
          CACHE_FEED,
        ),
    ];
    await mapWithConcurrency(feedPuts, PUT_CONCURRENCY, (fn) => fn());
    // KVS slug sync must not abort HTML/feeds (same isolation as resume PDF).
    try {
      await syncViewerRequestBlogSlugs(published.map((p) => p.slug));
    } catch (err) {
      console.error('CloudFront KVS blog slug sync failed; site rebuild continues', err);
    }
  }

  // Published resume → live HTML + PDF. Unpublished → placeholder HTML, delete PDF.
  // PDF failures must not abort HTML / sitemap / RSS (CHR-97).
  let resumePdfFailed = false;
  let resumePublished = false;
  let resumeUnpublished = false;
  if (scope.resume) {
    const resume = await sources.getPublishedResume();
    if (resume) {
      resumePublished = true;
      await storage.put(
        'resume/index.html',
        renderResumePage(shell, resume),
        'text/html; charset=utf-8',
        CACHE_HTML,
      );
      const pdfResult = await publishResumePdf(storage, resume);
      resumePdfFailed = pdfResult.status === 'kept-previous';
    } else {
      resumeUnpublished = true;
      await storage.put(
        'resume/index.html',
        renderResumeUnavailablePage(shell),
        'text/html; charset=utf-8',
        CACHE_HTML,
      );
      await storage.delete(RESUME_PDF_KEY);
    }
  }

  // Published home → write index.html + durable snapshot.
  // Draft / missing → restore from snapshot so deploys never fall back to DEFAULT_HOME.
  let homePublished = false;
  let homeRestoredFromSnapshot = false;
  if (scope.home) {
    const home = await sources.getPublishedHome();
    if (home) {
      homePublished = true;
      await storage.put(
        'index.html',
        renderHomePage(shell, home),
        'text/html; charset=utf-8',
        CACHE_HTML,
      );
      await storage.put(
        HOME_LAST_PUBLISHED_KEY,
        JSON.stringify(homeToSnapshot(home)),
        'application/json; charset=utf-8',
        CACHE_HTML,
      );
    } else {
      const snapshot = await readHomePublishSnapshot(storage);
      if (snapshot) {
        homeRestoredFromSnapshot = true;
        await storage.put(
          'index.html',
          renderHomePage(shell, snapshotToHome(snapshot)),
          'text/html; charset=utf-8',
          CACHE_HTML,
        );
      }
    }
  }

  const invalidated = buildInvalidationPaths({
    scope,
    changedKeys,
    removedSlugs,
  });

  await storage.invalidate(invalidated);

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
