import type { Context, DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { handlerSuccessFromRebuild } from './handler-result.js';
import { logger, metrics } from './observability.js';
import { rebuildPublishedSite } from './s3-site.js';
import { getPublishTargets } from './publish-targets/registry.js';
import type { PublishTarget } from './publish-targets/types.js';
import {
  collectRebuildScope,
  collectStreamPublishedPostItems,
  collectStreamPublishedProjectItems,
  fullRebuildScope,
  streamNeedsRebuild,
} from './rebuild-scope.js';
import { KvsSyncError } from './viewer-request-slugs.js';

export type RepublishAllEvent = {
  action: 'republishAll';
};

export type PublisherHandlerDeps = {
  getTargets?: () => readonly PublishTarget[];
  rebuild?: typeof rebuildPublishedSite;
};

let handlerDeps: PublisherHandlerDeps = {};

export function setPublisherHandlerDepsForTests(
  deps: PublisherHandlerDeps | undefined,
): void {
  handlerDeps = deps ?? {};
}

function isDynamoStreamEvent(event: unknown): event is DynamoDBStreamEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    Array.isArray((event as DynamoDBStreamEvent).Records) &&
    ((event as DynamoDBStreamEvent).Records.length === 0 ||
      (event as DynamoDBStreamEvent).Records[0]?.eventSource === 'aws:dynamodb')
  );
}

function isRepublishAll(event: unknown): event is RepublishAllEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as RepublishAllEvent).action === 'republishAll'
  );
}

export function collectSlugsToRemove(records: DynamoDBRecord[]): Set<string> {
  return collectRebuildScope(records).slugsToRemove;
}

export const handler = async (
  event: DynamoDBStreamEvent | RepublishAllEvent,
  context: Context,
): Promise<{ ok: true; publishedCount: number; removedSlugs: string[] }> => {
  logger.addContext(context);
  metrics.clearMetrics();

  const getTargets = handlerDeps.getTargets ?? getPublishTargets;
  const rebuild = handlerDeps.rebuild ?? rebuildPublishedSite;

  try {
    if (isRepublishAll(event)) {
      logger.info('Republish-all requested');
      const result = await rebuild({
        scope: fullRebuildScope(),
        targets: getTargets(),
      });
      return handlerSuccessFromRebuild(logger, metrics, result);
    }

    if (isDynamoStreamEvent(event)) {
      const targets = getTargets();
      if (!streamNeedsRebuild(event.Records, targets)) {
        logger.info('Stream batch has no PUBLISHED item changes; skipping');
        metrics.addMetric('Skipped', MetricUnit.Count, 1);
        metrics.publishStoredMetrics();
        return { ok: true, publishedCount: 0, removedSlugs: [] };
      }
      const scope = collectRebuildScope(event.Records);
      const streamPublishedPosts = collectStreamPublishedPostItems(
        event.Records,
      );
      const streamPublishedProjects = collectStreamPublishedProjectItems(
        event.Records,
      );
      logger.info('Rebuilding from stream', {
        recordCount: event.Records.length,
        allPosts: scope.allPosts,
        postSlugs: [...scope.postSlugs],
        slugsToRemove: [...scope.slugsToRemove],
        feeds: scope.feeds,
        home: scope.home,
        resume: scope.resume,
        projectIds: [...scope.projectIds],
        touchedEntityTypes: [...scope.touchedEntityTypes],
        streamPublishedPosts: streamPublishedPosts.length,
        streamPublishedProjects: streamPublishedProjects.length,
      });
      const result = await rebuild({
        scope,
        streamPublishedPosts,
        streamPublishedProjects,
        targets,
      });
      return handlerSuccessFromRebuild(logger, metrics, result);
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
