/**
 * Shared Powertools Logger / Metrics for the API Lambda (CHR-126).
 * One instance so contact (and other) handlers inherit request context and
 * publish a single EMF blob per invocation.
 */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';

export const logger = new Logger({ serviceName: 'gagnechris-api' });
export const metrics = new Metrics({
  namespace: 'gagnechris',
  serviceName: 'gagnechris-api',
});
