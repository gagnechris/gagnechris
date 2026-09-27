/**
 * Sync published blog slugs into a CloudFront KeyValueStore so the
 * viewer-request function can allowlist /blog/<slug> without rewriting
 * function code (CHR-115).
 */
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

const kvs = new CloudFrontKeyValueStoreClient({});

export type SlugKeyDiff = {
  puts: PutKeyRequestListItem[];
  deletes: DeleteKeyRequestListItem[];
};

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

async function listAllKeys(kvsArn: string): Promise<string[]> {
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

/**
 * Replace the KVS allowlist with the current published slugs.
 * No-ops locally and when BLOG_SLUGS_KVS_ARN is unset.
 * Does not modify CloudFront Function code.
 */
export async function syncViewerRequestBlogSlugs(
  slugs: string[],
): Promise<void> {
  if (isLocalCloudFront()) return;
  const kvsArn = process.env.BLOG_SLUGS_KVS_ARN?.trim();
  if (!kvsArn) {
    logger.warn('BLOG_SLUGS_KVS_ARN unset; skipped blog slug KVS sync');
    return;
  }

  const existing = await listAllKeys(kvsArn);
  const diff = diffBlogSlugKeys(existing, slugs);
  if (diff.puts.length === 0 && diff.deletes.length === 0) {
    logger.info('Blog slug KVS already in sync', {
      kvsArn,
      slugCount: slugs.length,
    });
    return;
  }

  const batches = batchSlugKeyDiff(diff);
  let etag: string | undefined;

  for (const batch of batches) {
    if (!etag) {
      const described = await kvs.send(
        new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }),
      );
      etag = described.ETag;
    }
    if (!etag) {
      throw new Error(`DescribeKeyValueStore missing ETag for ${kvsArn}`);
    }

    const updated = await kvs.send(
      new UpdateKeysCommand({
        KvsARN: kvsArn,
        IfMatch: etag,
        Puts: batch.puts.length ? batch.puts : undefined,
        Deletes: batch.deletes.length ? batch.deletes : undefined,
      }),
    );
    if (!updated.ETag) {
      throw new Error(`UpdateKeys missing ETag for ${kvsArn}`);
    }
    etag = updated.ETag;
  }

  logger.info('Synced blog slug KeyValueStore', {
    kvsArn,
    slugCount: slugs.length,
    puts: diff.puts.length,
    deletes: diff.deletes.length,
    batches: batches.length,
  });
}
