import type {
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { json, withApiResponseHeaders } from './http.js';
import { logger, metrics } from './observability.js';
import { dispatchRoutes, normalizePath } from './router.js';
import { routes } from './routes.js';

export const handler: APIGatewayProxyHandlerV2 = async (
  event,
  context: Context,
) => {
  logger.addContext(context);
  const method = event.requestContext.http.method.toUpperCase();
  const path = normalizePath(event.rawPath);
  logger.appendKeys({
    route: `${method} ${path}`,
    requestId: event.requestContext.requestId,
  });
  try {
    logger.info('request', { path });

    const response = await dispatchRoutes(routes, event, method, path);
    return response as APIGatewayProxyStructuredResultV2;
  } catch (error) {
    // Powertools reserves `message` and drops it with a WARN.
    logger.error('handler error', {
      error,
      errMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    metrics.addMetric('HandlerError', MetricUnit.Count, 1);
    return withApiResponseHeaders(json(500, { error: 'internal_error' }), {
      noStore: true,
    });
  } finally {
    metrics.publishStoredMetrics();
  }
};
