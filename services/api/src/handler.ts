import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import {
  AdminMeResponseSchema,
  HealthResponseSchema,
  type AdminMeResponse,
  type HealthResponse,
} from '@gagnechris/shared';
import { handlePostsRoute } from './posts/handlers.js';
import { handleHomeRoute } from './home/handlers.js';
import { handleResumeRoute } from './resume/handlers.js';
import { handleMediaRoute } from './media/handlers.js';
import { handleContactRoute } from './contact/handlers.js';

const logger = new Logger({ serviceName: 'gagnechris-api' });
const tracer = new Tracer({ serviceName: 'gagnechris-api' });
const metrics = new Metrics({
  namespace: 'gagnechris',
  serviceName: 'gagnechris-api',
});

function json(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function normalizePath(rawPath: string): string {
  return rawPath.replace(/\/$/, '') || '/';
}

function claimsFromEvent(
  event: APIGatewayProxyEventV2,
): Record<string, string> | undefined {
  const jwt = event.requestContext.authorizer?.jwt;
  if (!jwt?.claims) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(jwt.claims)) {
    if (typeof value === 'string') {
      out[key] = value;
    } else if (value != null) {
      out[key] = String(value);
    }
  }
  return out;
}

function handleHealth(): APIGatewayProxyStructuredResultV2 {
  const body: HealthResponse = HealthResponseSchema.parse({
    status: 'ok',
    service: 'gagnechris-api',
  });
  return json(200, body);
}

function handleAdminMe(
  event: APIGatewayProxyEventV2,
): APIGatewayProxyStructuredResultV2 {
  const claims = claimsFromEvent(event);
  if (!claims?.sub) {
    return json(401, { error: 'unauthorized', message: 'Missing JWT claims' });
  }

  const body: AdminMeResponse = AdminMeResponseSchema.parse({
    sub: claims.sub,
    email: claims.email,
    username: claims['cognito:username'] ?? claims.username,
  });
  return json(200, body);
}

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

    if (
      (method === 'GET' && path === '/api/health') ||
      (method === 'GET' && path === '/health')
    ) {
      metrics.addMetric('HealthCheck', MetricUnit.Count, 1);
      return handleHealth();
    }

    if (
      (method === 'GET' && path === '/api/admin/me') ||
      (method === 'GET' && path === '/admin/me')
    ) {
      metrics.addMetric('AdminMe', MetricUnit.Count, 1);
      return handleAdminMe(event);
    }

    const contactResponse = await handleContactRoute(event, method, path);
    if (contactResponse) {
      metrics.addMetric('ContactRoute', MetricUnit.Count, 1);
      return contactResponse;
    }

    const postsResponse = await handlePostsRoute(event, method, path);
    if (postsResponse) {
      metrics.addMetric('PostsRoute', MetricUnit.Count, 1);
      return postsResponse;
    }

    const homeResponse = await handleHomeRoute(event, method, path);
    if (homeResponse) {
      metrics.addMetric('HomeRoute', MetricUnit.Count, 1);
      return homeResponse;
    }

    const resumeResponse = await handleResumeRoute(event, method, path);
    if (resumeResponse) {
      metrics.addMetric('ResumeRoute', MetricUnit.Count, 1);
      return resumeResponse;
    }

    const mediaResponse = await handleMediaRoute(event, method, path);
    if (mediaResponse) {
      metrics.addMetric('MediaRoute', MetricUnit.Count, 1);
      return mediaResponse;
    }

    metrics.addMetric('NotFound', MetricUnit.Count, 1);
    return json(404, {
      error: 'not_found',
      message: `No route for ${method} ${path}`,
    });
  } catch (error) {
    logger.error('handler error', { error: String(error) });
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
