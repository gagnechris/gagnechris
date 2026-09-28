import type { Logger } from '@aws-lambda-powertools/logger';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { RebuildResult } from './rebuild-result.js';

export function recordPublishMetrics(
  metrics: Metrics,
  result: Pick<
    RebuildResult,
    'publishedCount' | 'removedSlugs' | 'invalidated' | 'resumePdfFailed'
  >,
): void {
  metrics.addMetric('PublishedPosts', MetricUnit.Count, result.publishedCount);
  metrics.addMetric(
    'RemovedPosts',
    MetricUnit.Count,
    result.removedSlugs.length,
  );
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

export function logPublishComplete(
  logger: Logger,
  result: RebuildResult,
): void {
  logger.info('Publish complete', {
    publishedCount: result.publishedCount,
    removedSlugs: result.removedSlugs,
    invalidationCount: result.invalidated.length,
    invalidated: result.invalidated,
    resumePdfFailed: result.resumePdfFailed,
  });
}

export type HandlerSuccessBody = {
  ok: true;
  publishedCount: number;
  removedSlugs: string[];
};

export function handlerSuccessFromRebuild(
  logger: Logger,
  metrics: Metrics,
  result: RebuildResult,
): HandlerSuccessBody {
  logPublishComplete(logger, result);
  recordPublishMetrics(metrics, result);
  metrics.publishStoredMetrics();
  return {
    ok: true,
    publishedCount: result.publishedCount,
    removedSlugs: result.removedSlugs,
  };
}
