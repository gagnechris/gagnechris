import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
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
  normalizeShellHtml,
  renderBlogIndexPage,
  renderHomePage,
  renderPostPage,
  renderResumePage,
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

export async function listPublishedPosts(tableName: string): Promise<Post[]> {
  const posts: Post[] = [];
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
      if (item.sk !== 'META' || item.entityType !== 'post') continue;
      posts.push(metaToPost(item as PostMetaRecord));
    }
    exclusiveStartKey = page.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return posts;
}

export async function getPublishedResume(
  tableName: string,
): Promise<Resume | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'RESUME#current', sk: 'META' },
    }),
  );
  const item = result.Item as ResumeMetaRecord | undefined;
  if (!item || item.entityType !== 'resume' || item.status !== 'published') {
    return undefined;
  }
  return metaToResume(item);
}

export async function getPublishedHome(
  tableName: string,
): Promise<Home | undefined> {
  const result = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: 'HOME#current', sk: 'META' },
    }),
  );
  const item = result.Item as HomeMetaRecord | undefined;
  if (!item || item.entityType !== 'home' || item.status !== 'published') {
    return undefined;
  }
  return metaToHome(item);
}

export type RebuildResult = {
  publishedCount: number;
  removedSlugs: string[];
  resumePublished: boolean;
  /** True when resume HTML was published but PDF generation failed (last good PDF kept). */
  resumePdfFailed: boolean;
  homePublished: boolean;
  invalidated: string[];
};

/**
 * Rebuild all published static artifacts from DynamoDB + the site shell.
 *
 * - When `slugsToRemove` is provided (stream path), only those candidates are
 *   considered for deletion.
 * - When omitted (republish-all / local), discover existing `blog/<slug>/index.html`
 *   keys and delete orphans not in the published set.
 */
export async function rebuildPublishedSite(options?: {
  slugsToRemove?: Iterable<string>;
  storage?: SiteStorage;
}): Promise<RebuildResult> {
  const tableName = requireEnv('DATA_TABLE_NAME');
  const storage = options?.storage ?? getSiteStorage();

  // index.html doubles as the home page, so drop any prior home prerender
  // before reusing it as the shell for /blog and /resume.
  const shell = normalizeShellHtml(await storage.readShell());
  const published = await listPublishedPosts(tableName);
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

  // Draft / missing resume leaves any live resume HTML/PDF untouched.
  // PDF failures must not abort HTML / sitemap / RSS (CHR-97).
  const resume = await getPublishedResume(tableName);
  let resumePdfFailed = false;
  if (resume) {
    await storage.put(
      'resume/index.html',
      renderResumePage(shell, resume),
      'text/html; charset=utf-8',
      CACHE_HTML,
    );
    const pdfResult = await publishResumePdf(storage, resume);
    resumePdfFailed = pdfResult.status === 'kept-previous';
  }

  // Draft / missing home leaves the deployed Vite shell (or the last published
  // prerender) in place; the SPA still renders DEFAULT_HOME on the client.
  const home = await getPublishedHome(tableName);
  if (home) {
    await storage.put(
      'index.html',
      renderHomePage(shell, home),
      'text/html; charset=utf-8',
      CACHE_HTML,
    );
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
    ...(resume
      ? ['/resume', '/resume/', '/resume/index.html', `/${RESUME_PDF_KEY}`]
      : []),
    ...(home ? ['/', '/index.html'] : []),
  ];

  await storage.invalidate(invalidated);

  return {
    publishedCount: published.length,
    removedSlugs,
    resumePublished: Boolean(resume),
    resumePdfFailed,
    homePublished: Boolean(home),
    invalidated: [...new Set(invalidated)],
  };
}
