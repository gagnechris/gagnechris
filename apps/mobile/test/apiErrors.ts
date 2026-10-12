import {
  ConflictErrorResponseSchema,
  PreconditionFailedErrorResponseSchema,
  type ConflictErrorResponse,
  type PreconditionFailedErrorResponse,
} from '@gagnechris/shared';

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A 409 whose body parses as the API's conflict response. */
export const conflict = (body: ConflictErrorResponse) =>
  json(409, ConflictErrorResponseSchema.parse(body));

/** A 412 for an `If-Match` mismatch, as the API answers it. */
export const preconditionFailed = (body: PreconditionFailedErrorResponse) =>
  json(412, PreconditionFailedErrorResponseSchema.parse(body));

/** A body `version` that lost to `current`: 409, never 412. */
export const versionConflict = (
  expected: number,
  current: { version: number },
) =>
  conflict({
    error: 'version_conflict',
    message: `Version conflict: expected ${expected}, current ${current.version}`,
    currentVersion: current.version,
    current,
  });

/** The version an `If-Match` header expects; `*` is any, null when absent. */
export const ifMatchVersion = (header: string | null): number | '*' | null => {
  if (header === null) return null;
  const value = header.trim();
  if (value === '*') return '*';
  const match = /^(?:W\/)?"?(\d+)"?$/i.exec(value);
  if (!match) throw new Error(`fake API: bad If-Match ${header}`);
  return Number(match[1]);
};
