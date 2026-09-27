import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { requireEnv } from './config.js';
import {
  metaToPost,
  type PostMetaRecord,
  toListItem,
} from './posts.js';
import {
  buildRssXml,
  buildSitemapXml,
  renderBlogIndexPage,
  renderPostPage,
} from './render.js';
import type { Post } from '@gagnechris/shared';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});

const CACHE_HTML = 'public,max-age=0,must-revalidate';
const CACHE_FEED = 'public,max-age=300';

async function readShellHtml(bucket: string): Promise<string> {
  const out = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: 'index.html' }),
  );
  const body = await out.Body?.transformToString('utf-8');
  if (!body) {
    throw new Error('Site shell index.html is empty or missing');
  }
  return body;
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

async function putText(
  bucket: string,
  key: string,
  body: string,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

async function deleteKey(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function invalidatePaths(
  distributionId: string,
  paths: string[],
): Promise<void> {
  const unique = [...new Set(paths)].filter(Boolean);
  if (unique.length === 0) return;

  // CloudFront allows 3000 paths per invalidation; we stay well under that.
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `publisher-${Date.now()}`,
        Paths: {
          Quantity: unique.length,
          Items: unique,
        },
      },
    }),
  );
}

export type RebuildResult = {
  publishedCount: number;
  removedSlugs: string[];
  invalidated: string[];
};

/**
 * Rebuild all published static artifacts from DynamoDB + the S3 site shell.
 * `slugsToRemove` are candidate post paths to delete (unpublish / rename).
 */
export async function rebuildPublishedSite(options?: {
  slugsToRemove?: Iterable<string>;
}): Promise<RebuildResult> {
  const tableName = requireEnv('DATA_TABLE_NAME');
  const bucket = requireEnv('SITE_BUCKET_NAME');
  const distributionId = requireEnv('CLOUDFRONT_DISTRIBUTION_ID');

  const shell = await readShellHtml(bucket);
  const published = await listPublishedPosts(tableName);
  const publishedSlugs = new Set(published.map((p) => p.slug));

  const removedSlugs: string[] = [];
  for (const slug of options?.slugsToRemove ?? []) {
    if (!slug || publishedSlugs.has(slug)) continue;
    await deleteKey(bucket, `blog/${slug}/index.html`);
    removedSlugs.push(slug);
  }

  for (const post of published) {
    const html = renderPostPage(shell, post);
    await putText(
      bucket,
      `blog/${post.slug}/index.html`,
      html,
      'text/html; charset=utf-8',
      CACHE_HTML,
    );
  }

  const blogIndex = renderBlogIndexPage(shell, published);
  await putText(
    bucket,
    'blog/index.html',
    blogIndex,
    'text/html; charset=utf-8',
    CACHE_HTML,
  );

  const listJson = JSON.stringify(
    { items: published.map(toListItem) },
    null,
    0,
  );
  await putText(
    bucket,
    'blog/posts.json',
    listJson,
    'application/json; charset=utf-8',
    CACHE_HTML,
  );

  await putText(
    bucket,
    'sitemap.xml',
    buildSitemapXml(published),
    'application/xml; charset=utf-8',
    CACHE_FEED,
  );
  await putText(
    bucket,
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
    '/sitemap.xml',
    '/rss.xml',
    ...published.map((p) => `/blog/${p.slug}`),
    ...published.map((p) => `/blog/${p.slug}/`),
    ...published.map((p) => `/blog/${p.slug}/index.html`),
    ...removedSlugs.map((s) => `/blog/${s}`),
    ...removedSlugs.map((s) => `/blog/${s}/`),
    ...removedSlugs.map((s) => `/blog/${s}/index.html`),
  ];

  await invalidatePaths(distributionId, invalidated);

  return {
    publishedCount: published.length,
    removedSlugs,
    invalidated: [...new Set(invalidated)],
  };
}
