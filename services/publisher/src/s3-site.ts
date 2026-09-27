import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { requireEnv, siteStorageMode } from './config.js';
import {
  metaToPost,
  type PostMetaRecord,
  toListItem,
} from './posts.js';
import { metaToHome, type HomeMetaRecord } from './home.js';
import { metaToResume, type ResumeMetaRecord } from './resume.js';
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
  const metaIds: string[] = [];
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
      if (item.entityType !== 'post' || item.sk !== 'META') continue;
      if (typeof item.postId === 'string') metaIds.push(item.postId);
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  const posts: Post[] = [];
  for (const postId of metaIds) {
    const published = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: `POST#${postId}`, sk: 'PUBLISHED' },
      }),
    );
    if (published.Item) {
      posts.push(metaToPost(published.Item as PostMetaRecord));
      continue;
    }

    // Rollout safety: copy legacy published META → PUBLISHED.
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
    await putPublishedSnapshot(tableName, { ...rest, sk: 'PUBLISHED', status: 'published' });
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
  await putPublishedSnapshot(tableName, { ...legacyItem, sk: 'PUBLISHED', status: 'published' });
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
  await putPublishedSnapshot(tableName, { ...legacyItem, sk: 'PUBLISHED', status: 'published' });
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

/**
 * Rebuild all published static artifacts from DynamoDB + the site shell.
 *
 * - When `slugsToRemove` is provided (stream path), only those candidates are
 *   considered for deletion.
 * - When omitted (republish-all / local), discover existing `blog/<slug>/index.html`
 *   keys and delete orphans not in the published set.
 * - Unpublished Resume: replace `resume/index.html` with a placeholder and
 *   delete `resume.pdf` (CHR-103).
 * - Unpublished Home: re-render `index.html` from `home/last-published.json` so
 *   the last published copy survives web deploys (CHR-103).
 */
export async function rebuildPublishedSite(options?: {
  slugsToRemove?: Iterable<string>;
  storage?: SiteStorage;
  sources?: RebuildSiteSources;
}): Promise<RebuildResult> {
  const tableName = requireEnv('DATA_TABLE_NAME');
  const storage = options?.storage ?? getSiteStorage();
  const sources: RebuildSiteSources = options?.sources ?? {
    listPublishedPosts: () => listPublishedPosts(tableName),
    getPublishedResume: () => getPublishedResume(tableName),
    getPublishedHome: () => getPublishedHome(tableName),
  };

  // Pristine Vite shell (_shell.html) — never the home prerender in index.html.
  const shell = await storage.readShell();
  const published = await sources.listPublishedPosts();
  const publishedSlugs = new Set(published.map((p) => p.slug));

  let candidates: Iterable<string>;
  if (options?.slugsToRemove !== undefined) {
    candidates = options.slugsToRemove;
  } else {
    const keys = await storage.list('blog/');
    candidates = postSlugsFromKeys(keys);
  }

  const removedSlugs: string[] = [];
  for (const slug of candidates) {
    if (!slug || publishedSlugs.has(slug)) continue;
    await storage.delete(`blog/${slug}/index.html`);
    removedSlugs.push(slug);
  }

  for (const post of published) {
    const html = renderPostPage(shell, post);
    await storage.put(
      `blog/${post.slug}/index.html`,
      html,
      'text/html; charset=utf-8',
      CACHE_HTML,
    );
  }

  await storage.put(
    'blog/index.html',
    renderBlogIndexPage(shell, published),
    'text/html; charset=utf-8',
    CACHE_HTML,
  );

  await storage.put(
    'blog/posts.json',
    JSON.stringify({ items: published.map(toListItem) }, null, 0),
    'application/json; charset=utf-8',
    CACHE_HTML,
  );

  // Allowlist for the CloudFront viewer-request function (CHR-102).
  const publishedSlugList = published.map((p) => p.slug);
  await storage.put(
    'blog/slugs.json',
    JSON.stringify({ slugs: publishedSlugList }, null, 0),
    'application/json; charset=utf-8',
    CACHE_HTML,
  );
  await syncViewerRequestBlogSlugs(publishedSlugList);

  // Published resume → live HTML + PDF. Unpublished → placeholder HTML, delete PDF.
  // PDF failures must not abort HTML / sitemap / RSS (CHR-97).
  const resume = await sources.getPublishedResume();
  let resumePdfFailed = false;
  let resumeUnpublished = false;
  if (resume) {
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

  // Published home → write index.html + durable snapshot.
  // Draft / missing → restore from snapshot so deploys never fall back to DEFAULT_HOME.
  const home = await sources.getPublishedHome();
  let homeRestoredFromSnapshot = false;
  if (home) {
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

  await storage.put(
    'sitemap.xml',
    buildSitemapXml(published),
    'application/xml; charset=utf-8',
    CACHE_FEED,
  );
  await storage.put(
    'rss.xml',
    buildRssXml(published),
    'application/rss+xml; charset=utf-8',
    CACHE_FEED,
  );

  const invalidated = [
    '/blog',
    '/blog/',
    '/blog/index.html',
    '/blog/posts.json',
    '/blog/slugs.json',
    '/sitemap.xml',
    '/rss.xml',
    '/404.html',
    ...published.map((p) => `/blog/${p.slug}`),
    ...published.map((p) => `/blog/${p.slug}/`),
    ...published.map((p) => `/blog/${p.slug}/index.html`),
    ...removedSlugs.map((s) => `/blog/${s}`),
    ...removedSlugs.map((s) => `/blog/${s}/`),
    ...removedSlugs.map((s) => `/blog/${s}/index.html`),
    '/resume',
    '/resume/',
    '/resume/index.html',
    `/${RESUME_PDF_KEY}`,
    ...(home || homeRestoredFromSnapshot ? ['/', '/index.html'] : []),
  ];

  await storage.invalidate(invalidated);

  return {
    publishedCount: published.length,
    removedSlugs,
    resumePublished: Boolean(resume),
    resumeUnpublished,
    resumePdfFailed,
    homePublished: Boolean(home),
    homeRestoredFromSnapshot,
    invalidated: [...new Set(invalidated)],
  };
}
