/**
 * Shared corrupt-row logging for list/query paths (CHR-160 / CHR-170).
 */
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { DataIntegrityError } from './errors.js';
import { logger, metrics } from '../observability.js';

export function logCorruptStoredItem(error: DataIntegrityError): void {
  logger.warn('Skipping corrupt stored item', {
    pk: error.pk,
    sk: error.sk,
    errMessage: error.message,
    causeMessage:
      error.cause instanceof Error ? error.cause.message : undefined,
  });
  metrics.addMetric('DataIntegrityError', MetricUnit.Count, 1);
}
