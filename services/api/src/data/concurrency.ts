import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ConflictError, PreconditionFailedError } from './errors.js';

export type IfMatchExpectation =
  { kind: 'version'; version: number } | { kind: 'any' };

export function headerValue(
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

export function parseIfMatch(
  headers: Record<string, string | undefined> | undefined,
): IfMatchExpectation | undefined {
  const raw = headerValue(headers, 'if-match');
  if (raw == null || raw === '') return undefined;
  const trimmed = raw.trim();
  if (trimmed === '*') return { kind: 'any' };
  if (trimmed.includes(',')) {
    throw new SyntaxError('Invalid If-Match header');
  }
  const stripped = trimmed.replace(/^W\//i, '').replace(/^"|"$/g, '');
  if (!/^\d+$/.test(stripped)) {
    throw new SyntaxError('Invalid If-Match header');
  }
  const n = Number(stripped);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new SyntaxError('Invalid If-Match header');
  }
  return { kind: 'version', version: n };
}

export function parseIfMatchVersion(
  headers: Record<string, string | undefined> | undefined,
): number | undefined {
  const match = parseIfMatch(headers);
  return match?.kind === 'version' ? match.version : undefined;
}

export type ExpectedVersionResolution = {
  expected?: number | 'any';
  fromIfMatch: boolean;
};

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
