import type {
  AttributeValue,
  Context,
  DynamoDBRecord,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { rebuildPublishedSite } from './s3-site.js';
import type { PostMetaRecord } from './posts.js';

const logger = new Logger({ serviceName: 'gagnechris-publisher' });
const metrics = new Metrics({
  namespace: 'gagnechris',
  serviceName: 'gagnechris-publisher',
});

export type RepublishAllEvent = {
  action: 'republishAll';
};

function isDynamoStreamEvent(event: unknown): event is DynamoDBStreamEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    Array.isArray((event as DynamoDBStreamEvent).Records) &&
    ((event as DynamoDBStreamEvent).Records.length === 0 ||
      (event as DynamoDBStreamEvent).Records[0]?.eventSource ===
        'aws:dynamodb')
  );
}

function isRepublishAll(event: unknown): event is RepublishAllEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as RepublishAllEvent).action === 'republishAll'
  );
}

function imageToMeta(
  image: Record<string, AttributeValue> | undefined,
): PostMetaRecord | undefined {
  if (!image) return undefined;
  // aws-lambda AttributeValue vs SDK v3 util-dynamodb AttributeValue shapes differ.
  const item = unmarshall(
    image as Parameters<typeof unmarshall>[0],
  ) as PostMetaRecord;
  if (item.sk !== 'META') return undefined;
  return item;
}

/** Collect slugs that may need S3 cleanup after unpublish / delete / rename. */
export function collectSlugsToRemove(records: DynamoDBRecord[]): Set<string> {
  const slugs = new Set<string>();
  for (const record of records) {
    const oldMeta = imageToMeta(record.dynamodb?.OldImage);
    const newMeta = imageToMeta(record.dynamodb?.NewImage);
    if (!oldMeta || oldMeta.status !== 'published' || !oldMeta.slug) {
      continue;
    }
    const stillSameSlug =
      newMeta?.status === 'published' && newMeta.slug === oldMeta.slug;
    if (!stillSameSlug) {
      slugs.add(oldMeta.slug);
    }
  }
  return slugs;
}

function streamNeedsRebuild(records: DynamoDBRecord[]): boolean {
  for (const record of records) {
    const oldMeta = imageToMeta(record.dynamodb?.OldImage);
    const newMeta = imageToMeta(record.dynamodb?.NewImage);
    if (newMeta?.status === 'published' || oldMeta?.status === 'published') {
      return true;
    }
  }
  return false;
}

export const handler = async (
  event: DynamoDBStreamEvent | RepublishAllEvent,
  context: Context,
): Promise<{ ok: true; publishedCount: number; removedSlugs: string[] }> => {
  logger.addContext(context);
  metrics.clearMetrics();

  try {
    let slugsToRemove: Iterable<string> | undefined;

    if (isRepublishAll(event)) {
      logger.info('Republish-all requested');
    } else if (isDynamoStreamEvent(event)) {
      if (!streamNeedsRebuild(event.Records)) {
        logger.info('Stream batch has no published META changes; skipping');
        metrics.addMetric('Skipped', MetricUnit.Count, 1);
        metrics.publishStoredMetrics();
        return { ok: true, publishedCount: 0, removedSlugs: [] };
      }
      slugsToRemove = collectSlugsToRemove(event.Records);
      logger.info('Rebuilding from stream', {
        recordCount: event.Records.length,
        slugsToRemove: [...slugsToRemove],
      });
    } else {
      throw new Error('Unsupported publisher event');
    }

    const result = await rebuildPublishedSite({ slugsToRemove });
    logger.info('Publish complete', {
      publishedCount: result.publishedCount,
      removedSlugs: result.removedSlugs,
      invalidationCount: result.invalidated.length,
    });
    metrics.addMetric('PublishedPosts', MetricUnit.Count, result.publishedCount);
    metrics.addMetric('RemovedPosts', MetricUnit.Count, result.removedSlugs.length);
    metrics.addMetric('Success', MetricUnit.Count, 1);
    metrics.publishStoredMetrics();
    return {
      ok: true,
      publishedCount: result.publishedCount,
      removedSlugs: result.removedSlugs,
    };
  } catch (err) {
    logger.error('Publisher failed', { err });
    metrics.addMetric('Error', MetricUnit.Count, 1);
    metrics.publishStoredMetrics();
    throw err;
  }
};

