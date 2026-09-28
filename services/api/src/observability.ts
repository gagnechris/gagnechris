/**
 * Shared Powertools Logger / Metrics for the API Lambda (CHR-126).
 * One instance so contact (and other) handlers inherit request context and
 * publish a single EMF blob per invocation.
 */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import {
  API_SERVICE_NAME,
  POWERTOOLS_METRICS_NAMESPACE,
} from '@gagnechris/shared';

export const logger = new Logger({ serviceName: API_SERVICE_NAME });
export const metrics = new Metrics({
  namespace: POWERTOOLS_METRICS_NAMESPACE,
  serviceName: API_SERVICE_NAME,
});
