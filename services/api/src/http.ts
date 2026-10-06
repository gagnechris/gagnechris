import { gzipSync } from 'node:zlib';
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
  InvalidJsonBodyError,
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

/** `no-store` on authenticated routes and errors so notebook JSON never lands in a browser disk cache. */
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

const GZIP_MIN_BYTES = 1024;

/** Neither API Gateway nor the no-cache CloudFront `/api` behavior compresses, so large JSON is gzipped here. */
export function gzipJsonResponse(
  event: Pick<APIGatewayProxyEventV2, 'headers'>,
  response: APIGatewayProxyStructuredResultV2,
): APIGatewayProxyStructuredResultV2 {
  const body = response.body;
  const type = response.headers?.['Content-Type'];
  if (
    !body ||
    response.isBase64Encoded ||
    typeof type !== 'string' ||
    !type.startsWith('application/json') ||
    Buffer.byteLength(body) < GZIP_MIN_BYTES ||
    !/\bgzip\b/i.test(event.headers?.['accept-encoding'] ?? '')
  ) {
    return response;
  }
  return {
    ...response,
    headers: {
      ...response.headers,
      'Content-Encoding': 'gzip',
      Vary: 'Accept-Encoding',
    },
    body: gzipSync(body).toString('base64'),
    isBase64Encoded: true,
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

export function parseBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidJsonBodyError();
  }
}

export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

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

export function isZodTooLarge(error: ZodError): boolean {
  return (
    error.issues.length > 0 &&
    error.issues.every((issue) => issue.code === 'too_big')
  );
}

/** Same per-field codes as a 400 so clients can point at the field. */
export function zodPayloadTooLarge(
  error: ZodError,
): APIGatewayProxyStructuredResultV2 {
  return json(413, {
    error: 'payload_too_large',
    message: error.issues[0]?.message ?? 'Request body is too large',
    fields: zodFieldCodes(error),
  });
}

export function mapRouteError(
  error: unknown,
): APIGatewayProxyStructuredResultV2 | undefined {
  // Backstop only; prefer throwCursorValidation at the query site.
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
    metrics.addMetric('WriteConflict', MetricUnit.Count, 1);
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
    metrics.addMetric('WriteConflict', MetricUnit.Count, 1);
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
  // bug and must surface as 500 via the outer handler.
  return undefined;
}
