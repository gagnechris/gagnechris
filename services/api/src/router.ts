/**
 * Declarative API router (CHR-127 / CHR-154).
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
import type { z, ZodType } from 'zod';
import {
  isZodError,
  json,
  mapRouteError,
  parseBody,
  zodBadRequest,
} from './http.js';
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

export type RouteHandler<
  TParams = Record<string, string>,
  TQuery = unknown,
  TBody = unknown,
> = (
  ctx: RouteCtx,
  input: RouteInput<TParams, TQuery, TBody>,
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

type InferOrDefault<T extends ZodType | undefined, TDefault> = [T] extends [
  ZodType,
]
  ? z.infer<T>
  : TDefault;

/**
 * Build a `RouteDef` with handler input inferred from zod schemas (CHR-154).
 * Use this instead of casting `params` / `query` / `body` inside handlers.
 */
export function defineRoute<
  TParams extends ZodType | undefined = undefined,
  TQuery extends ZodType | undefined = undefined,
  TBody extends ZodType | undefined = undefined,
>(def: {
  method: RouteDef['method'];
  pattern: string;
  auth: AuthMode;
  metric?: string;
  params?: TParams;
  query?: TQuery;
  body?: TBody;
  rawBody?: boolean;
  handler: RouteHandler<
    InferOrDefault<TParams, Record<string, string>>,
    InferOrDefault<TQuery, Record<string, string | undefined>>,
    InferOrDefault<TBody, unknown>
  >;
}): RouteDef {
  return def as RouteDef;
}

/** Thrown when a path segment fails `decodeURIComponent` (malformed % escape). */
export class MalformedPathError extends Error {
  constructor(message = 'Malformed path encoding') {
    super(message);
    this.name = 'MalformedPathError';
  }
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new MalformedPathError();
  }
}

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

/**
 * API Gateway JWT authorizer prefixes (must stay aligned with
 * `infra/lib/stacks/api-stack.ts`). Admin route patterns must live under these.
 */
export const API_GATEWAY_JWT_PREFIXES = ['/admin', '/notebook'] as const;

/** True when a canonical path is under an API Gateway JWT-protected prefix. */
export function isJwtProtectedPath(path: string): boolean {
  return API_GATEWAY_JWT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Whether any route matching this path declares `auth: 'admin'` (for local
 * claim injection — mirrors JWT gate without duplicating prefixes).
 * Malformed `%` escapes are treated as non-matches so the handler can return
 * 400 (CHR-166); do not throw here.
 */
export function pathRequiresAdminAuth(
  routes: readonly RouteDef[],
  rawPath: string,
): boolean {
  const path = canonicalPath(rawPath);
  for (const route of routes) {
    if (route.auth !== 'admin') continue;
    try {
      if (matchPattern(route.pattern, path) != null) return true;
    } catch (error) {
      if (!(error instanceof MalformedPathError)) throw error;
    }
  }
  return false;
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
 * Returns params or null. Throws {@link MalformedPathError} on bad % escapes.
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
      params[name] = pathParts.slice(j).map(decodePathSegment).join('/');
      return params;
    }
    if (part.startsWith(':')) {
      params[part.slice(1)] = decodePathSegment(pathParts[j]!);
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

/** Higher = more literal segments (prefer `/tasks/today` over `/tasks/:id`). */
export function patternSpecificity(pattern: string): number {
  return pattern
    .split('/')
    .filter(Boolean)
    .filter((part) => !part.startsWith(':')).length;
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
): Promise<APIGatewayProxyStructuredResultV2> {
  if (route.auth === 'admin' && !ctx.userId) {
    return json(401, {
      error: 'unauthorized',
      message: 'Missing JWT claims',
    });
  }

  let query: unknown = ctx.event.queryStringParameters ?? {};
  if (route.query) {
    try {
      query = route.query.parse(query);
    } catch (error) {
      if (isZodError(error)) {
        return zodBadRequest(error, 'Invalid query parameters');
      }
      throw error;
    }
  }

  let body: unknown = undefined;
  if (route.rawBody) {
    body = undefined;
  } else if (route.body) {
    try {
      body = route.body.parse(parseBody(ctx.event));
    } catch (error) {
      if (isZodError(error)) {
        return zodBadRequest(error, 'Invalid request body');
      }
      throw error;
    }
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
    try {
      typedParams = route.params.parse(params) as Record<string, string>;
    } catch (error) {
      if (isZodError(error)) {
        return zodBadRequest(error, 'Invalid path parameters');
      }
      throw error;
    }
  }

  return route.handler(ctx, { params: typedParams, query, body });
}

/**
 * Convert a router pattern to an OpenAPI path (`/admin/posts/:id` →
 * `/api/admin/posts/{id}`; `:key+` → `{key}`).
 */
export function routePatternToOpenApiPath(pattern: string): string {
  const openApi = pattern.replace(/:([A-Za-z_][A-Za-z0-9_]*)\+?/g, '{$1}');
  return `/api${openApi}`;
}

/**
 * Dispatch a request against a route table.
 * Known path + wrong method → 405 (with `Allow`); unknown path → 404.
 * When multiple patterns match, prefer more literal segments (CHR-154).
 */
export async function dispatchRoutes(
  routes: readonly RouteDef[],
  event: APIGatewayProxyEventV2,
  method: string,
  rawPath: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const path = canonicalPath(rawPath);
  const methodUpper = method.toUpperCase();
  const ctx = buildCtx(event, methodUpper, path);

  const pathMatches: Array<{
    route: RouteDef;
    params: Record<string, string>;
  }> = [];
  try {
    for (const route of routes) {
      const params = matchPattern(route.pattern, path);
      if (params) pathMatches.push({ route, params });
    }
  } catch (error) {
    if (error instanceof MalformedPathError) {
      return json(400, {
        error: 'bad_request',
        message: error.message,
      });
    }
    throw error;
  }

  if (pathMatches.length === 0) {
    defaultMetrics.addMetric('NotFound', MetricUnit.Count, 1);
    return json(404, {
      error: 'not_found',
      message: `No route for ${methodUpper} ${normalizePath(rawPath)}`,
    });
  }

  const methodMatches = pathMatches.filter(
    (m) => m.route.method === methodUpper,
  );
  if (methodMatches.length === 0) {
    defaultMetrics.addMetric('MethodNotAllowed', MetricUnit.Count, 1);
    const allowed = [...new Set(pathMatches.map((m) => m.route.method))].sort();
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        Allow: allowed.join(', '),
      },
      body: JSON.stringify({
        error: 'method_not_allowed',
        message: `Method ${methodUpper} not allowed; use ${allowed.join(', ')}`,
      }),
    };
  }

  methodMatches.sort(
    (a, b) =>
      patternSpecificity(b.route.pattern) - patternSpecificity(a.route.pattern),
  );
  const { route, params } = methodMatches[0]!;
  // Per-route metric name only (no redundant `route` dimension) — CHR-154.
  defaultMetrics.addMetric(metricName(route), MetricUnit.Count, 1);

  try {
    return await invokeRoute(route, ctx, params);
  } catch (error) {
    const mapped = mapRouteError(error);
    if (mapped) return mapped;
    throw error;
  }
}
