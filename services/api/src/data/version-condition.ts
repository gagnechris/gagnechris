/**
 * Requires the item to exist so a hard-deleted row is never recreated.
 * Missing `version` is treated as 0 so rows written without one remain updatable.
 */
import { isOptimisticLockConflict } from '@gagnechris/data';
import { ConflictError, type ConflictCode } from './errors.js';
import { runDynamoWrite } from './dynamo-write.js';

export const VERSION_MATCH_CONDITION =
  'attribute_exists(pk) AND (version = :v OR (attribute_not_exists(version) AND :v = :zero))' as const;

export function versionMatchValues(
  expectedVersion: number,
): Record<string, number> {
  return { ':v': expectedVersion, ':zero': 0 };
}

export async function throwVersionConflict<T extends { version: number }>(
  expectedVersion: number,
  getCurrent: () => Promise<T | undefined>,
  opts?: { code?: ConflictCode },
): Promise<never> {
  const current = await getCurrent();
  throw new ConflictError(
    `Version conflict: expected ${expectedVersion}, current ${current?.version ?? 'unknown'}`,
    {
      currentVersion: current?.version,
      current,
      code: opts?.code ?? 'version_conflict',
    },
  );
}

const UNIQUE_CLAIM_CODES = new Set(['slug_taken', 'daily_taken']);

/**
 * When a unique-claim failure coincides with a version failure on
 * `versionItemIndex`, the version conflict wins so the client gets `current`.
 */
export async function runVersionedWrite<TResult>(
  write: () => Promise<TResult>,
  conflictMessage: string,
  onConflict: () => Promise<never>,
  opts?: {
    slugClaimIndexes?: readonly number[];
    slugTakenMessage?: string;
    uniqueClaimIndexes?: readonly number[];
    uniqueClaimCode?: 'slug_taken' | 'daily_taken';
    uniqueClaimMessage?: string;
    /** TransactWrite index of the versioned META Put (usually 0). */
    versionItemIndex?: number;
  },
): Promise<TResult> {
  try {
    return await runDynamoWrite(write, conflictMessage, opts);
  } catch (error) {
    if (error instanceof ConflictError && UNIQUE_CLAIM_CODES.has(error.code)) {
      throw error;
    }
    if (error instanceof ConflictError || isOptimisticLockConflict(error)) {
      return await onConflict();
    }
    throw error;
  }
}
