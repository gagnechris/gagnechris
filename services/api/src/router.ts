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
  isZodTooLarge,
  json,
  mapRouteError,
  parseBody,
  withApiResponseHeaders,
  zodBadRequest,
  zodPayloadTooLarge,
} from './http.js';
import {
  logger as defaultLogger,
  metrics as defaultMetrics,
} from './observability.js';

export type ProtectedAuth = 'site-admin' | 'user-admin' | 'notebook';
export type AuthMode = 'public' | ProtectedAuth;

export type RouteCtx = {
  event: APIGatewayProxyEventV2;
  method: string;
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
  pattern: string;
  auth: AuthMode;
  metric?: string;
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  rawBody?: boolean;
  /** Set on notebook writes, whose field limits guard the DynamoDB item size. */
  oversizedBody413?: boolean;
  handler: RouteHandler;
};

export type InferOrDefault<T extends ZodType | undefined, TDefault> = [
  T,
] extends [ZodType]
  ? z.infer<T>
  : TDefault;

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
  oversizedBody413?: boolean;
  handler: RouteHandler<
    InferOrDefault<TParams, Record<string, string>>,
    InferOrDefault<TQuery, Record<string, string | undefined>>,
    InferOrDefault<TBody, unknown>
  >;
}): RouteDef {
  return def as RouteDef;
}

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

export function canonicalPath(rawPath: string): string {
  const normalized = normalizePath(rawPath);
  if (normalized === '/api') return '/';
  if (normalized.startsWith('/api/')) return normalized.slice(4) || '/';
  return normalized;
}

/** Must stay aligned with `infra/lib/stacks/api-stack.ts`; protected routes must live under these. */
export const API_GATEWAY_JWT_PREFIXES = ['/admin', '/notebook'] as const;

export function isJwtProtectedPath(path: string): boolean {
  return API_GATEWAY_JWT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export type AuthPolicy = {
  prefix: (typeof API_GATEWAY_JWT_PREFIXES)[number];
  group: string;
  clientIdEnv: string;
  trustsIos: boolean;
};

export const IOS_CLIENT_ID_ENV = 'IOS_CLIENT_ID';

export const AUTH_POLICIES: Record<ProtectedAuth, AuthPolicy> = {
  'site-admin': {
    prefix: '/admin',
    group: 'site-admin',
    clientIdEnv: 'ADMIN_WEB_CLIENT_ID',
    trustsIos: false,
  },
  'user-admin': {
    prefix: '/admin',
    group: 'user-admin',
    clientIdEnv: 'ADMIN_WEB_CLIENT_ID',
    trustsIos: false,
  },
  notebook: {
    prefix: '/notebook',
    group: 'notebook',
    clientIdEnv: 'NOTEBOOK_WEB_CLIENT_ID',
    trustsIos: true,
  },
};

export const USER_ADMIN_PATH = '/admin/users';

/** The auth a protected route pattern must declare; undefined for public paths. */
export function requiredAuthForPattern(
  pattern: string,
): ProtectedAuth | undefined {
  const under = (prefix: string) =>
    pattern === prefix || pattern.startsWith(`${prefix}/`);
  if (under(USER_ADMIN_PATH)) return 'user-admin';
  if (under('/admin')) return 'site-admin';
  if (under('/notebook')) return 'notebook';
  return undefined;
}

/** Malformed `%` escapes are non-matches so the handler can return 400; do not throw here. */
export function routeAuthForPath(
  routes: readonly RouteDef[],
  rawPath: string,
): ProtectedAuth | undefined {
  const path = canonicalPath(rawPath);
  for (const route of routes) {
    if (route.auth === 'public') continue;
    try {
      if (matchPattern(route.pattern, path) != null) return route.auth;
    } catch (error) {
      if (!(error instanceof MalformedPathError)) throw error;
    }
  }
  return undefined;
}

/**
 * Accepts a JSON array of strings or the HTTP API authorizer's bracketed form
 * (`[a b]`), split on whitespace only: Cognito group names may contain commas.
 * Anything else is no groups.
 */
export function claimGroups(raw: string | undefined): string[] {
  const value = raw?.trim();
  if (!value) return [];
  if (value.startsWith('["')) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) &&
        parsed.every((group) => typeof group === 'string')
        ? parsed
        : [];
    } catch {
      return [];
    }
  }
  const bracketed = /^\[([^[\]"]*)\]$/.exec(value);
  if (!bracketed) return [];
  return bracketed[1]!.split(/\s+/).filter(Boolean);
}

/** ID tokens name the client in `aud`, access tokens in `client_id`; anything else names none. */
export function tokenClientId(
  claims: Record<string, string> | undefined,
): string | undefined {
  if (claims?.token_use === 'id') return claims.aud || undefined;
  if (claims?.token_use === 'access') return claims.client_id || undefined;
  return undefined;
}

function envClientId(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export type AuthDecision =
  { ok: true } | { ok: false; status: 401 | 403; message: string };

export function authorize(
  auth: ProtectedAuth,
  claims: Record<string, string> | undefined,
): AuthDecision {
  if (!claims?.sub) {
    return { ok: false, status: 401, message: 'Missing JWT claims' };
  }
  const policy = AUTH_POLICIES[auth];
  const clientId = tokenClientId(claims);
  const groups = claimGroups(claims['cognito:groups']);
  const trusted = [
    envClientId(policy.clientIdEnv),
    policy.trustsIos ? envClientId(IOS_CLIENT_ID_ENV) : undefined,
  ];
  if (clientId && trusted.includes(clientId)) {
    return groups.includes(policy.group)
      ? { ok: true }
      : {
          ok: false,
          status: 403,
          message: `Requires the ${policy.group} group`,
        };
  }
  return {
    ok: false,
    status: 403,
    message: `Token is not from the ${policy.prefix.slice(1)} app client`,
  };
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
    } else if (Array.isArray(value)) {
      out[key] = JSON.stringify(value);
    } else if (value != null) {
      out[key] = String(value);
    }
  }
  return out;
}

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
  if (route.auth !== 'public') {
    const decision = authorize(route.auth, ctx.claims);
    if (!decision.ok) {
      return json(decision.status, {
        error: decision.status === 401 ? 'unauthorized' : 'forbidden',
        message: decision.message,
      });
    }
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
        if (route.oversizedBody413 && isZodTooLarge(error)) {
          return zodPayloadTooLarge(error);
        }
        return zodBadRequest(error, 'Invalid request body');
      }
      throw error;
    }
  } else if (
    route.method === 'POST' ||
    route.method === 'PUT' ||
    route.method === 'PATCH'
  ) {
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

export function routePatternToOpenApiPath(pattern: string): string {
  const openApi = pattern.replace(/:([A-Za-z_][A-Za-z0-9_]*)\+?/g, '{$1}');
  return `/api${openApi}`;
}

export async function dispatchRoutes(
  routes: readonly RouteDef[],
  event: APIGatewayProxyEventV2,
  method: string,
  rawPath: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  let matched: RouteDef | undefined;
  const response = await dispatchMatched(
    routes,
    event,
    method,
    rawPath,
    (route) => {
      matched = route;
    },
  );
  const status = response.statusCode ?? 200;
  return withApiResponseHeaders(response, {
    noStore: matched?.auth !== 'public' || status >= 400,
  });
}

async function dispatchMatched(
  routes: readonly RouteDef[],
  event: APIGatewayProxyEventV2,
  method: string,
  rawPath: string,
  onMatch: (route: RouteDef) => void,
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
  onMatch(route);
  defaultMetrics.addMetric(metricName(route), MetricUnit.Count, 1);

  try {
    return await invokeRoute(route, ctx, params);
  } catch (error) {
    const mapped = mapRouteError(error);
    if (mapped) return mapped;
    throw error;
  }
}
