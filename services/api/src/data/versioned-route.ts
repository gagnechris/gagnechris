/**
 * Shared If-Match / ETag helpers for versioned Notebook mutations (CHR-171).
 * Fake-note routes and future note/task handlers should use these — no copied logic.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { json, jsonWithEtag } from '../http.js';
import { mapVersionConflict, resolveExpectedVersion } from './concurrency.js';

export type ExpectedVersionOk = {
  ok: true;
  expected: number | 'any';
  fromIfMatch: boolean;
};

export type ExpectedVersionErr = {
  ok: false;
  response: APIGatewayProxyStructuredResultV2;
};

/**
 * Parse If-Match (or body.version). Malformed If-Match → 400.
 * Missing expectation → 400 with a clear message.
 */
export function requireExpectedVersion(
  event: APIGatewayProxyEventV2,
  body: { version?: number },
): ExpectedVersionOk | ExpectedVersionErr {
  try {
    const { expected, fromIfMatch } = resolveExpectedVersion(event, body);
    if (expected === undefined) {
      return {
        ok: false,
        response: json(400, {
          error: 'bad_request',
          message: 'Expected version required (If-Match or body.version)',
        }),
      };
    }
    return { ok: true, expected, fromIfMatch };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: json(400, {
          error: 'bad_request',
          message: error.message,
        }),
      };
    }
    throw error;
  }
}

/** Resolve `If-Match: *` to the current server version for write calls. */
export function versionForWrite(
  expected: number | 'any',
  currentVersion: number,
): number {
  return expected === 'any' ? currentVersion : expected;
}

/** Run a versioned mutation; If-Match conflicts become 412. */
export async function runVersionedMutation<T>(
  fromIfMatch: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    mapVersionConflict(error, fromIfMatch);
  }
}

/** JSON + strong ETag from an entity `version`. */
export function jsonEntity<T extends { version: number }>(
  statusCode: number,
  entity: T,
  mapBody: (entity: T) => unknown = (e) => e,
): APIGatewayProxyStructuredResultV2 {
  return jsonWithEtag(statusCode, mapBody(entity), entity.version);
}
