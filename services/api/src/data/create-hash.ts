/**
 * Stored as a hash, never the fields themselves, so note/task text doesn't
 * outlive edits and deletes in `createHash`. Older rows may hold the raw
 * joined string; {@link createHashMatches} accepts that form until
 * `scripts/migrate-create-hash.mjs` rewrites them.
 */
import { createHash as nodeCreateHash } from 'node:crypto';

export const CREATE_HASH_PREFIX = 'sha256:';

export function joinCreateFields(fields: readonly string[]): string {
  return fields.join('\0');
}

/** Also used by the migration. */
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
