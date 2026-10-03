/**
 * Shared Powertools Logger / Metrics for the restore-test Lambda (CHR-198).
 */
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import {
  POWERTOOLS_METRICS_NAMESPACE,
  RESTORE_TEST_SERVICE_NAME,
} from '@gagnechris/shared';

export const logger = new Logger({ serviceName: RESTORE_TEST_SERVICE_NAME });
export const metrics = new Metrics({
  namespace: POWERTOOLS_METRICS_NAMESPACE,
  serviceName: RESTORE_TEST_SERVICE_NAME,
});
