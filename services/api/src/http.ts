import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { ZodError } from 'zod';
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ServiceUnavailableError,
} from './data/errors.js';
import { RateLimitExceededError } from './contact/rateLimit.js';

export function json(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** JSON response with weak ETag quoting the entity `version` (CHR-141). */
export function jsonWithEtag(
  statusCode: number,
  body: unknown,
  version: number,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ETag: `"${version}"`,
    },
    body: JSON.stringify(body),
  };
}

/** Parse `If-Match` as an integer entity version (strips surrounding quotes). */
export function parseIfMatchVersion(
  headers: Record<string, string | undefined> | undefined,
): number | undefined {
  const raw =
    headers?.['if-match'] ??
    headers?.['If-Match'] ??
    (headers
      ? Object.entries(headers).find(
          ([k]) => k.toLowerCase() === 'if-match',
        )?.[1]
      : undefined);
  if (raw == null || raw === '') return undefined;
  const stripped = raw.trim().replace(/^"|"$/g, '');
  const n = Number(stripped);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export function parseBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}

export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

/** First Zod issue code per field path (no full issue dump). */
export function zodFieldCodes(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!(key in fields)) {
      fields[key] = issue.code;
    }
  }
  return fields;
}

/** Friendly 400 for Zod validation — short message + per-field codes. */
export function zodBadRequest(
  error: ZodError,
  message = 'Invalid request body',
): APIGatewayProxyStructuredResultV2 {
  return json(400, {
    error: 'bad_request',
    message,
    fields: zodFieldCodes(error),
  });
}

/** Map common handler errors to HTTP responses; return undefined to rethrow. */
export function mapRouteError(
  error: unknown,
  zodMessage = 'Invalid request body',
): APIGatewayProxyStructuredResultV2 | undefined {
  if (error instanceof SyntaxError) {
    return json(400, { error: 'bad_request', message: error.message });
  }
  if (error instanceof NotFoundError) {
    return json(404, { error: 'not_found', message: error.message });
  }
  if (error instanceof PreconditionFailedError) {
    return json(412, {
      error: 'precondition_failed',
      message: error.message,
      ...(error.currentVersion !== undefined
        ? { currentVersion: error.currentVersion }
        : {}),
    });
  }
  if (error instanceof ConflictError) {
    return json(409, {
      error: 'conflict',
      message: error.message,
      ...(error.currentVersion !== undefined
        ? { currentVersion: error.currentVersion }
        : {}),
      ...(error.current !== undefined ? { current: error.current } : {}),
    });
  }
  if (error instanceof ServiceUnavailableError) {
    return json(503, { error: 'service_unavailable', message: error.message });
  }
  if (error instanceof RateLimitExceededError) {
    return json(429, { error: 'rate_limited', message: error.message });
  }
  if (isZodError(error)) {
    return zodBadRequest(error, zodMessage);
  }
  return undefined;
}
