import type { Context, DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { rebuildPublishedSite } from './s3-site.js';
import {
  collectRebuildScope,
  fullRebuildScope,
  streamNeedsRebuild,
} from './rebuild-scope.js';
import { KvsSyncError } from './viewer-request-slugs.js';

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

/** Collect slugs that may need S3 cleanup after unpublish / delete / rename. */
export function collectSlugsToRemove(records: DynamoDBRecord[]): Set<string> {
  return collectRebuildScope(records).slugsToRemove;
}

function recordPublishMetrics(result: {
  publishedCount: number;
  removedSlugs: string[];
  invalidated: string[];
  resumePdfFailed: boolean;
}): void {
  metrics.addMetric('PublishedPosts', MetricUnit.Count, result.publishedCount);
  metrics.addMetric('RemovedPosts', MetricUnit.Count, result.removedSlugs.length);
  metrics.addMetric(
    'InvalidationPaths',
    MetricUnit.Count,
    result.invalidated.length,
  );
  if (result.resumePdfFailed) {
    metrics.addMetric('ResumePdfError', MetricUnit.Count, 1);
  }
  metrics.addMetric('Success', MetricUnit.Count, 1);
}

export const handler = async (
  event: DynamoDBStreamEvent | RepublishAllEvent,
  context: Context,
): Promise<{ ok: true; publishedCount: number; removedSlugs: string[] }> => {
  logger.addContext(context);
  metrics.clearMetrics();

  try {
    if (isRepublishAll(event)) {
      logger.info('Republish-all requested');
      const result = await rebuildPublishedSite({
        scope: fullRebuildScope(),
      });
      logger.info('Publish complete', {
        publishedCount: result.publishedCount,
        removedSlugs: result.removedSlugs,
        invalidationCount: result.invalidated.length,
        invalidated: result.invalidated,
        resumePdfFailed: result.resumePdfFailed,
      });
      recordPublishMetrics(result);
      metrics.publishStoredMetrics();
      return {
        ok: true,
        publishedCount: result.publishedCount,
        removedSlugs: result.removedSlugs,
      };
    }

    if (isDynamoStreamEvent(event)) {
      if (!streamNeedsRebuild(event.Records)) {
        logger.info('Stream batch has no PUBLISHED item changes; skipping');
        metrics.addMetric('Skipped', MetricUnit.Count, 1);
        metrics.publishStoredMetrics();
        return { ok: true, publishedCount: 0, removedSlugs: [] };
      }
      const scope = collectRebuildScope(event.Records);
      logger.info('Rebuilding from stream', {
        recordCount: event.Records.length,
        allPosts: scope.allPosts,
        postSlugs: [...scope.postSlugs],
        slugsToRemove: [...scope.slugsToRemove],
        feeds: scope.feeds,
        home: scope.home,
        resume: scope.resume,
      });
      const result = await rebuildPublishedSite({ scope });
      logger.info('Publish complete', {
        publishedCount: result.publishedCount,
        removedSlugs: result.removedSlugs,
        invalidationCount: result.invalidated.length,
        invalidated: result.invalidated,
        resumePdfFailed: result.resumePdfFailed,
      });
      recordPublishMetrics(result);
      metrics.publishStoredMetrics();
      return {
        ok: true,
        publishedCount: result.publishedCount,
        removedSlugs: result.removedSlugs,
      };
    }

    throw new Error('Unsupported publisher event');
  } catch (err) {
    logger.error('Publisher failed', { err });
    if (
      err instanceof KvsSyncError ||
      (typeof err === 'object' &&
        err !== null &&
        'kvsSyncFailed' in err &&
        (err as { kvsSyncFailed?: boolean }).kvsSyncFailed)
    ) {
      metrics.addMetric('KvsSyncFailed', MetricUnit.Count, 1);
    }
    metrics.addMetric('Error', MetricUnit.Count, 1);
    metrics.publishStoredMetrics();
    throw err;
  }
};
