/**
 * Declarative API router (CHR-127).
 * Path patterns use `/admin/...` (no `/api` prefix); incoming `/api/*` is stripped.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { Logger } from '@aws-lambda-powertools/logger';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type { ZodType } from 'zod';
import { json, mapRouteError, parseBody } from './http.js';
import {
  logger as defaultLogger,
  metrics as defaultMetrics,
} from './observability.js';

export type AuthMode = 'public' | 'admin';

export type RouteCtx = {
  event: APIGatewayProxyEventV2;
  method: string;
  /** Canonical path (trailing slash stripped, `/api` prefix removed). */
  path: string;
  claims: Record<string, string> | undefined;
  userId: string | undefined;
  requestId: string;
  logger: Logger;
  metrics: Metrics;
};

export type RouteInput<
  TParams = Record<string, string>,
  TQuery = unknown,
  TBody = unknown,
> = {
  params: TParams;
  query: TQuery;
  body: TBody;
};

export type RouteHandler = (
  ctx: RouteCtx,
  input: RouteInput,
) => Promise<APIGatewayProxyStructuredResultV2>;

export type RouteDef = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Pattern relative to site root after stripping `/api`, e.g. `/admin/posts/:id`. */
  pattern: string;
  auth: AuthMode;
  /** Metric name (defaults to a slug of method+pattern). */
  metric?: string;
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  /** When true, skip JSON body parse (binary PUT). */
  rawBody?: boolean;
  handler: RouteHandler;
};

export function normalizePath(rawPath: string): string {
  return rawPath.replace(/\/$/, '') || '/';
}

/** Strip `/api` so `/api/admin/posts` and `/admin/posts` share one pattern. */
export function canonicalPath(rawPath: string): string {
  const normalized = normalizePath(rawPath);
  if (normalized === '/api') return '/';
  if (normalized.startsWith('/api/')) return normalized.slice(4) || '/';
  return normalized;
}

export function claimsFromEvent(
  event: APIGatewayProxyEventV2 | APIGatewayProxyEventV2WithJWTAuthorizer,
): Record<string, string> | undefined {
  const jwt =
    event.requestContext && 'authorizer' in event.requestContext
      ? (
          event.requestContext as APIGatewayProxyEventV2WithJWTAuthorizer['requestContext']
        ).authorizer?.jwt
      : undefined;
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

/**
 * Match `/admin/posts/:id` or `/admin/media/objects/:key+` against a path.
 * Returns params or null.
 */
export function matchPattern(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  let i = 0;
  let j = 0;
  while (i < patternParts.length && j < pathParts.length) {
    const part = patternParts[i]!;
    if (part.startsWith(':') && part.endsWith('+')) {
      const name = part.slice(1, -1);
      params[name] = pathParts.slice(j).map(decodeURIComponent).join('/');
      return params;
    }
    if (part.startsWith(':')) {
      params[part.slice(1)] = decodeURIComponent(pathParts[j]!);
      i += 1;
      j += 1;
      continue;
    }
    if (part !== pathParts[j]) return null;
    i += 1;
    j += 1;
  }
  if (i === patternParts.length && j === pathParts.length) return params;
  return null;
}

function metricName(route: RouteDef): string {
  if (route.metric) return route.metric;
  return `${route.method}_${route.pattern.replace(/[^a-zA-Z0-9]+/g, '_')}`;
}

function buildCtx(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
): RouteCtx {
  const claims = claimsFromEvent(event);
  return {
    event,
    method,
    path,
    claims,
    userId: claims?.sub,
    requestId: event.requestContext?.requestId ?? 'unknown',
    logger: defaultLogger,
    metrics: defaultMetrics,
  };
}

async function invokeRoute(
  route: RouteDef,
  ctx: RouteCtx,
  params: Record<string, string>,
  enforceAuth: boolean,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (enforceAuth && route.auth === 'admin' && !ctx.userId) {
    return json(401, {
      error: 'unauthorized',
      message: 'Missing JWT claims',
    });
  }

  let query: unknown = ctx.event.queryStringParameters ?? {};
  if (route.query) {
    query = route.query.parse(query);
  }

  let body: unknown = undefined;
  if (route.rawBody) {
    body = undefined;
  } else if (route.body) {
    body = route.body.parse(parseBody(ctx.event));
  } else if (
    route.method === 'POST' ||
    route.method === 'PUT' ||
    route.method === 'PATCH'
  ) {
    // Handlers that parse themselves still get a raw object when no schema.
    body = parseBody(ctx.event);
  }

  let typedParams: Record<string, string> = params;
  if (route.params) {
    typedParams = route.params.parse(params) as Record<string, string>;
  }

  return route.handler(ctx, { params: typedParams, query, body });
}

export type DispatchOptions = {
  /**
   * When no route matches: `'404'` (default) or `'undefined'` (module fallthrough
   * for legacy per-module tests).
   */
  onMiss?: '404' | 'undefined';
  /**
   * Enforce `auth: 'admin'` (default true for the Lambda entry). Module test
   * helpers set false — API Gateway already gated those routes in prod.
   */
  enforceAuth?: boolean;
};

/**
 * Dispatch a request against a route table.
 * Known path + wrong method → 405; unknown path → 404 (or undefined).
 */
export async function dispatchRoutes(
  routes: readonly RouteDef[],
  event: APIGatewayProxyEventV2,
  method: string,
  rawPath: string,
  options: DispatchOptions = {},
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  const path = canonicalPath(rawPath);
  const methodUpper = method.toUpperCase();
  const ctx = buildCtx(event, methodUpper, path);
  const onMiss = options.onMiss ?? '404';
  const enforceAuth = options.enforceAuth ?? true;

  const pathMatches: Array<{
    route: RouteDef;
    params: Record<string, string>;
  }> = [];
  for (const route of routes) {
    const params = matchPattern(route.pattern, path);
    if (params) pathMatches.push({ route, params });
  }

  if (pathMatches.length === 0) {
    if (onMiss === 'undefined') return undefined;
    defaultMetrics.addMetric('NotFound', MetricUnit.Count, 1);
    return json(404, {
      error: 'not_found',
      message: `No route for ${methodUpper} ${normalizePath(rawPath)}`,
    });
  }

  const methodMatch = pathMatches.find((m) => m.route.method === methodUpper);
  if (!methodMatch) {
    defaultMetrics.addMetric('MethodNotAllowed', MetricUnit.Count, 1);
    const allowed = [...new Set(pathMatches.map((m) => m.route.method))].join(
      ', ',
    );
    return json(405, {
      error: 'method_not_allowed',
      message: `Method ${methodUpper} not allowed; use ${allowed}`,
    });
  }

  const { route, params } = methodMatch;
  const metric = defaultMetrics
    .singleMetric()
    .addDimension('route', `${route.method} ${route.pattern}`);
  metric.addMetric(metricName(route), MetricUnit.Count, 1);

  try {
    return await invokeRoute(route, ctx, params, enforceAuth);
  } catch (error) {
    const mapped = mapRouteError(error);
    if (mapped) return mapped;
    throw error;
  }
}
