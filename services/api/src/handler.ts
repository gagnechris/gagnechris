import type {
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { json } from './http.js';
import { logger, metrics } from './observability.js';
import { dispatchRoutes, normalizePath } from './router.js';
import { routes } from './routes.js';

const tracer = new Tracer({ serviceName: 'gagnechris-api' });

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
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('handler');
  if (subsegment) {
    tracer.setSegment(subsegment);
  }

  try {
    logger.info('request', { path });

    const response = await dispatchRoutes(routes, event, method, path);
    return response as APIGatewayProxyStructuredResultV2;
  } catch (error) {
    logger.error('handler error', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    metrics.addMetric('HandlerError', MetricUnit.Count, 1);
    return json(500, { error: 'internal_error' });
  } finally {
    metrics.publishStoredMetrics();
    subsegment?.close();
    if (segment) {
      tracer.setSegment(segment);
    }
  }
};
