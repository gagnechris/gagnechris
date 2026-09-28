import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { ZodError } from 'zod';
import {
  ConflictError,
  NotFoundError,
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
  if (error instanceof ConflictError) {
    return json(409, { error: 'conflict', message: error.message });
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
