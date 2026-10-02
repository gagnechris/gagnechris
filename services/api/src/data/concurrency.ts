/**
 * If-Match / ETag helpers for Notebook optimistic concurrency (CHR-141 / CHR-162).
 */
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ConflictError, PreconditionFailedError } from './errors.js';

/** Parsed `If-Match` expectation. */
export type IfMatchExpectation =
  { kind: 'version'; version: number } | { kind: 'any' };

function headerValue(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  if (headers[lower] != null) return headers[lower];
  if (headers[name] != null) return headers[name];
  const entry = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === lower,
  );
  return entry?.[1];
}

/**
 * Parse `If-Match` as a versioned entity expectation.
 * Accepts `"3"`, `W/"3"`, and `*` (resource must exist; any version).
 */
export function parseIfMatch(
  headers: Record<string, string | undefined> | undefined,
): IfMatchExpectation | undefined {
  const raw = headerValue(headers, 'if-match');
  if (raw == null || raw === '') return undefined;
  const trimmed = raw.trim();
  if (trimmed === '*') return { kind: 'any' };
  // Strip optional weak validator prefix then surrounding quotes.
  const stripped = trimmed.replace(/^W\//i, '').replace(/^"|"$/g, '');
  const n = Number(stripped);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return { kind: 'version', version: n };
}

/** Parse `If-Match` as an integer entity version (`*` → undefined). */
export function parseIfMatchVersion(
  headers: Record<string, string | undefined> | undefined,
): number | undefined {
  const match = parseIfMatch(headers);
  return match?.kind === 'version' ? match.version : undefined;
}

export type ExpectedVersionResolution = {
  /** Concrete version, `any` for `If-Match: *`, or missing. */
  expected?: number | 'any';
  fromIfMatch: boolean;
};

/**
 * Prefer `If-Match` over body `version`. Used by Notebook mutation routes.
 */
export function resolveExpectedVersion(
  event: APIGatewayProxyEventV2,
  body: { version?: number },
): ExpectedVersionResolution {
  const fromIfMatch = parseIfMatch(event.headers ?? {});
  if (fromIfMatch) {
    if (fromIfMatch.kind === 'any') {
      return { expected: 'any', fromIfMatch: true };
    }
    return { expected: fromIfMatch.version, fromIfMatch: true };
  }
  if (body.version !== undefined) {
    return { expected: body.version, fromIfMatch: false };
  }
  return { expected: undefined, fromIfMatch: false };
}

/** Map a version ConflictError to 412 when the client sent If-Match. */
export function mapVersionConflict(
  error: unknown,
  fromIfMatch: boolean,
): never {
  if (error instanceof ConflictError && fromIfMatch) {
    throw new PreconditionFailedError(error.message, {
      currentVersion: error.currentVersion,
      current: error.current,
    });
  }
  throw error;
}
