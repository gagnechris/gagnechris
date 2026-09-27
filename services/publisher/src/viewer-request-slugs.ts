/**
 * Sync published blog slugs into a CloudFront KeyValueStore so the
 * viewer-request function can allowlist /blog/<slug> without rewriting
 * function code (CHR-115 / CHR-119).
 */
import '@aws-sdk/signature-v4a';
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  ListKeysCommand,
  UpdateKeysCommand,
  type DeleteKeyRequestListItem,
  type PutKeyRequestListItem,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import { Logger } from '@aws-lambda-powertools/logger';
import { isLocalCloudFront } from './config.js';

const logger = new Logger({ serviceName: 'gagnechris-publisher' });

/** Sentinel key: absent → CF Function fail-opens; present → enforce allowlist. */
export const BLOG_SLUG_SYNCED_KEY = '__synced__';

/** Combined puts+deletes per UpdateKeys call (API page size / safety bound). */
export const KVS_UPDATE_BATCH_SIZE = 50;

/** Retries for ConflictException / transient API failures (CHR-119). */
export const KVS_SYNC_MAX_ATTEMPTS = 3;

const kvs = new CloudFrontKeyValueStoreClient({});

export type SlugKeyDiff = {
  puts: PutKeyRequestListItem[];
  deletes: DeleteKeyRequestListItem[];
};

/** Injectable client for unit tests (concurrent sync / ETag race). */
export type BlogSlugKvsClient = {
  describeETag: (kvsArn: string) => Promise<string>;
  listKeys: (kvsArn: string) => Promise<string[]>;
  updateKeys: (input: {
    kvsArn: string;
    ifMatch: string;
    puts: PutKeyRequestListItem[];
    deletes: DeleteKeyRequestListItem[];
  }) => Promise<string>;
};

export class KvsSyncError extends Error {
  readonly kvsSyncFailed = true as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KvsSyncError';
  }
}

/**
 * Diff desired published slugs against keys already in the KVS.
 * Always ensures the __synced__ sentinel is present after sync.
 */
export function diffBlogSlugKeys(
  existingKeys: Iterable<string>,
  slugs: string[],
): SlugKeyDiff {
  const existing = new Set(existingKeys);
  const desired = new Set<string>();
  for (const slug of slugs) {
    if (slug && slug !== BLOG_SLUG_SYNCED_KEY) {
      desired.add(slug);
    }
  }
  desired.add(BLOG_SLUG_SYNCED_KEY);

  const puts: PutKeyRequestListItem[] = [];
  const deletes: DeleteKeyRequestListItem[] = [];

  for (const key of desired) {
    if (!existing.has(key)) {
      puts.push({ Key: key, Value: '1' });
    }
  }
  for (const key of existing) {
    if (!desired.has(key)) {
      deletes.push({ Key: key });
    }
  }

  return { puts, deletes };
}

/** Split puts/deletes into batches that fit one UpdateKeys call. */
export function batchSlugKeyDiff(
  diff: SlugKeyDiff,
  batchSize = KVS_UPDATE_BATCH_SIZE,
): SlugKeyDiff[] {
  const batches: SlugKeyDiff[] = [];
  let putOffset = 0;
  let deleteOffset = 0;

  while (putOffset < diff.puts.length || deleteOffset < diff.deletes.length) {
    const puts: PutKeyRequestListItem[] = [];
    const deletes: DeleteKeyRequestListItem[] = [];
    let remaining = batchSize;

    while (remaining > 0 && putOffset < diff.puts.length) {
      puts.push(diff.puts[putOffset]!);
      putOffset += 1;
      remaining -= 1;
    }
    while (remaining > 0 && deleteOffset < diff.deletes.length) {
      deletes.push(diff.deletes[deleteOffset]!);
      deleteOffset += 1;
      remaining -= 1;
    }

    batches.push({ puts, deletes });
  }

  return batches;
}

async function listAllKeysWithSdk(kvsArn: string): Promise<string[]> {
  const keys: string[] = [];
  let nextToken: string | undefined;
  do {
    const page = await kvs.send(
      new ListKeysCommand({
        KvsARN: kvsArn,
        MaxResults: 50,
        NextToken: nextToken,
      }),
    );
    for (const item of page.Items ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return keys;
}

function defaultSdkClient(): BlogSlugKvsClient {
  return {
    async describeETag(kvsArn) {
      const described = await kvs.send(
        new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
      );
      if (!described.ETag) {
        throw new Error(`DescribeKeyValueStore missing ETag for ${kvsArn}`);
      }
      return described.ETag;
    },
    listKeys: listAllKeysWithSdk,
    async updateKeys({ kvsArn, ifMatch, puts, deletes }) {
      const updated = await kvs.send(
        new UpdateKeysCommand({
          KvsARN: kvsArn,
          IfMatch: ifMatch,
          Puts: puts.length ? puts : undefined,
          Deletes: deletes.length ? deletes : undefined,
        }),
      );
      if (!updated.ETag) {
        throw new Error(`UpdateKeys missing ETag for ${kvsArn}`);
      }
      return updated.ETag;
    },
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One describe → list → update cycle.
 * ETag is taken before ListKeys so IfMatch covers the list→update window (CHR-119).
 */
export async function syncBlogSlugsOnce(
  kvsArn: string,
  slugs: string[],
  client: BlogSlugKvsClient,
): Promise<'synced' | 'noop'> {
  // Describe first so the ETag covers list → update (avoids concurrent races).
  let etag = await client.describeETag(kvsArn);
  const existing = await client.listKeys(kvsArn);
  const diff = diffBlogSlugKeys(existing, slugs);
  if (diff.puts.length === 0 && diff.deletes.length === 0) {
    return 'noop';
  }

  const batches = batchSlugKeyDiff(diff);
  for (const batch of batches) {
    etag = await client.updateKeys({
      kvsArn,
      ifMatch: etag,
      puts: batch.puts,
      deletes: batch.deletes,
    });
  }
  return 'synced';
}

export type SyncBlogSlugsOptions = {
  client?: BlogSlugKvsClient;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Replace the KVS allowlist with the current published slugs.
 * Retries the full describe→list→update cycle on conflict / transient errors.
 */
export async function syncBlogSlugsWithClient(
  kvsArn: string,
  slugs: string[],
  options: SyncBlogSlugsOptions = {},
): Promise<'synced' | 'noop'> {
  const client = options.client ?? defaultSdkClient();
  const maxAttempts = options.maxAttempts ?? KVS_SYNC_MAX_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await syncBlogSlugsOnce(kvsArn, slugs, client);
      if (result === 'noop') {
        logger.info('Blog slug KVS already in sync', {
          kvsArn,
          slugCount: slugs.length,
          attempt,
        });
      } else {
        logger.info('Synced blog slug KeyValueStore', {
          kvsArn,
          slugCount: slugs.length,
          attempt,
        });
      }
      return result;
    } catch (err) {
      lastError = err;
      logger.warn('Blog slug KVS sync attempt failed', {
        kvsArn,
        attempt,
        maxAttempts,
        err,
      });
      if (attempt < maxAttempts) {
        await sleep(50 * 2 ** (attempt - 1));
      }
    }
  }

  throw new KvsSyncError(
    `CloudFront KVS blog slug sync failed after ${maxAttempts} attempts`,
    { cause: lastError },
  );
}

/**
 * Replace the KVS allowlist with the current published slugs.
 * No-ops locally and when BLOG_SLUGS_KVS_ARN is unset.
 * Does not modify CloudFront Function code.
 * Throws {@link KvsSyncError} after retries so the stream can retry (CHR-119).
 */
export async function syncViewerRequestBlogSlugs(
  slugs: string[],
  options?: SyncBlogSlugsOptions,
): Promise<void> {
  if (isLocalCloudFront()) return;
  const kvsArn = process.env.BLOG_SLUGS_KVS_ARN?.trim();
  if (!kvsArn) {
    logger.warn('BLOG_SLUGS_KVS_ARN unset; skipped blog slug KVS sync');
    return;
  }

  await syncBlogSlugsWithClient(kvsArn, slugs, options);
}
