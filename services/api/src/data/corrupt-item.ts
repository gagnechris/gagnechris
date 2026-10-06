import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { DataIntegrityError } from './errors.js';
import { logger, metrics } from '../observability.js';

export function logCorruptStoredItem(
  error: DataIntegrityError,
  metricName: 'DataIntegrityError' | 'SyncCorruptRow' = 'DataIntegrityError',
): void {
  logger.warn('Skipping corrupt stored item', {
    pk: error.pk,
    sk: error.sk,
    errMessage: error.message,
    causeMessage:
      error.cause instanceof Error ? error.cause.message : undefined,
  });
  metrics.addMetric(metricName, MetricUnit.Count, 1);
}
