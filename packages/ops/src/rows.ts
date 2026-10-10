import { createHash } from 'node:crypto';

/** ISO-8601 "now"; tools take one so tests can pin time. */
export type Clock = () => string;

export const systemClock: Clock = () => new Date().toISOString();

// Missing `version` is treated as 0, as the API's writes do.
export const VERSION_MATCH_CONDITION =
  'attribute_exists(pk) AND (version = :v OR (attribute_not_exists(version) AND :v = :zero))' as const;

export function versionMatchValues(
  expectedVersion: number,
): Record<string, number> {
  return { ':v': expectedVersion, ':zero': 0 };
}

const CREATE_HASH_PREFIX = 'sha256:';

export function hashJoinedCreateFields(joined: string): string {
  return CREATE_HASH_PREFIX + createHash('sha256').update(joined).digest('hex');
}

export function isHashedCreateHash(stored: string): boolean {
  return stored.startsWith(CREATE_HASH_PREFIX);
}
