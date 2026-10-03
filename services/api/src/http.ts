import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { ZodError } from 'zod';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import {
  BadRequestError,
  ConflictError,
  DataIntegrityError,
  NotFoundError,
  PreconditionFailedError,
  ResyncRequiredError,
  ServiceUnavailableError,
  SyncAdapterMissingError,
  UpgradeRequiredError,
} from './data/errors.js';
import { isExclusiveStartKeyValidationError } from './data/dynamo-errors.js';
import { RateLimitExceededError } from './contact/rateLimit.js';
import { logger, metrics } from './observability.js';

/**
 * Browser-facing response headers (CHR-196): `nosniff` on every API response,
 * `Cache-Control: no-store` on authenticated routes and errors so notebook
 * JSON never lands in a browser disk cache. Public successes (health,
 * contact, resume notify) keep whatever their handler set.
 */
export function withApiResponseHeaders(
  response: APIGatewayProxyStructuredResultV2,
  opts: { noStore: boolean },
): APIGatewayProxyStructuredResultV2 {
  return {
    ...response,
    headers: {
      ...response.headers,
      'X-Content-Type-Options': 'nosniff',
      ...(opts.noStore ? { 'Cache-Control': 'no-store' } : {}),
    },
  };
}

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

/** JSON response with strong ETag quoting the entity `version` (CHR-141 / CHR-162). */
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

export {
  parseIfMatch,
  parseIfMatchVersion,
  resolveExpectedVersion,
  mapVersionConflict,
  type IfMatchExpectation,
  type ExpectedVersionResolution,
} from './data/concurrency.js';

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

/** True when a body failed only because a field is over its size limit. */
export function isZodTooLarge(error: ZodError): boolean {
  return (
    error.issues.length > 0 &&
    error.issues.every((issue) => issue.code === 'too_big')
  );
}

/**
 * 413 for oversized notebook fields (CHR-192), with the same per-field codes
 * as a 400 so clients can point at the field.
 */
export function zodPayloadTooLarge(
  error: ZodError,
): APIGatewayProxyStructuredResultV2 {
  return json(413, {
    error: 'payload_too_large',
    message: error.issues[0]?.message ?? 'Request body is too large',
    fields: zodFieldCodes(error),
  });
}

/** Map common handler errors to HTTP responses; return undefined to rethrow. */
export function mapRouteError(
  error: unknown,
): APIGatewayProxyStructuredResultV2 | undefined {
  if (error instanceof SyntaxError) {
    return json(400, { error: 'bad_request', message: error.message });
  }
  // Belt-and-suspenders: ExclusiveStartKey ValidationException → 400 (CHR-170).
  // Prefer throwing SyntaxError at the query site via throwCursorValidation.
  if (isExclusiveStartKeyValidationError(error)) {
    return json(400, {
      error: 'bad_request',
      message: 'Invalid pagination cursor',
    });
  }
  if (error instanceof BadRequestError) {
    return json(400, {
      error: 'bad_request',
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    });
  }
  if (error instanceof NotFoundError) {
    return json(404, { error: 'not_found', message: error.message });
  }
  if (error instanceof ResyncRequiredError) {
    return json(410, { error: 'resync_required', message: error.message });
  }
  if (error instanceof UpgradeRequiredError) {
    return json(426, {
      error: 'upgrade_required',
      message: error.message,
      minClientVersion: error.minClientVersion,
    });
  }
  if (error instanceof PreconditionFailedError) {
    return json(412, {
      error: 'precondition_failed',
      message: error.message,
      ...(error.currentVersion !== undefined
        ? { currentVersion: error.currentVersion }
        : {}),
      ...(error.current !== undefined ? { current: error.current } : {}),
    });
  }
  if (error instanceof ConflictError) {
    return json(409, {
      error: error.code,
      message: error.message,
      ...(error.currentVersion !== undefined
        ? { currentVersion: error.currentVersion }
        : {}),
      ...(error.current !== undefined ? { current: error.current } : {}),
    });
  }
  if (error instanceof DataIntegrityError) {
    logger.error('Data integrity error', {
      pk: error.pk,
      sk: error.sk,
      errMessage: error.message,
      causeMessage:
        error.cause instanceof Error ? error.cause.message : undefined,
    });
    metrics.addMetric('DataIntegrityError', MetricUnit.Count, 1);
    return json(500, {
      error: 'data_integrity',
      message: 'Stored data failed validation',
    });
  }
  if (error instanceof SyncAdapterMissingError) {
    logger.error('Sync row has no registered adapter', {
      changeType: error.changeType,
    });
    metrics.addMetric('SyncAdapterMissing', MetricUnit.Count, 1);
    return json(500, {
      error: 'sync_adapter_missing',
      message: 'Sync feed cannot decode a stored change',
    });
  }
  if (error instanceof ServiceUnavailableError) {
    return json(503, { error: 'service_unavailable', message: error.message });
  }
  if (error instanceof RateLimitExceededError) {
    return json(429, { error: 'rate_limited', message: error.message });
  }
  // Request Zod is caught in invokeRoute. Handler/response ZodError is a server
  // bug and must surface as 500 via the outer handler (CHR-168).
  return undefined;
}
