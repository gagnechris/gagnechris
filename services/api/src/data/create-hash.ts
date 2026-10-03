/**
 * Create-payload fingerprints for idempotent client-ULID creates (CHR-192).
 *
 * The stored value is `sha256:<hex>` of the NUL-joined create fields, never
 * the fields themselves, so note/task text doesn't outlive edits and deletes
 * in `createHash`. Rows written before CHR-192 hold the raw joined string;
 * {@link createHashMatches} accepts that form until the migration script
 * (`scripts/migrate-create-hash.mjs`) has rewritten them.
 */
import { createHash as nodeCreateHash } from 'node:crypto';

export const CREATE_HASH_PREFIX = 'sha256:';

/** Pre-CHR-192 canonical form: fields joined with NUL. */
export function joinCreateFields(fields: readonly string[]): string {
  return fields.join('\0');
}

/** Hash an already-joined canonical string (also used by the migration). */
export function hashJoinedCreateFields(joined: string): string {
  return (
    CREATE_HASH_PREFIX + nodeCreateHash('sha256').update(joined).digest('hex')
  );
}

export function hashCreateFields(fields: readonly string[]): string {
  return hashJoinedCreateFields(joinCreateFields(fields));
}

export function isHashedCreateHash(stored: string): boolean {
  return stored.startsWith(CREATE_HASH_PREFIX);
}

/**
 * True when a stored `createHash` proves the request is a replay of the
 * original create. Legacy plaintext rows are hashed before comparing.
 */
export function createHashMatches(
  stored: string | undefined,
  requestHash: string,
): boolean {
  if (stored === undefined) return false;
  const normalized = isHashedCreateHash(stored)
    ? stored
    : hashJoinedCreateFields(stored);
  return normalized === requestHash;
}
