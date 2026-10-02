/**
 * Single optimistic-concurrency write condition for versioned entities (CHR-161).
 * Requires the item to exist — prevents recreating a hard-deleted row.
 */
import { isOptimisticLockConflict } from '@gagnechris/data';
import { ConflictError } from './errors.js';
import { runDynamoWrite } from './dynamo-write.js';

export const VERSION_MATCH_CONDITION =
  'attribute_exists(pk) AND version = :v' as const;

export async function throwVersionConflict<T extends { version: number }>(
  expectedVersion: number,
  getCurrent: () => Promise<T | undefined>,
  opts?: { code?: 'conflict' | 'slug_taken' },
): Promise<never> {
  const current = await getCurrent();
  throw new ConflictError(
    `Version conflict: expected ${expectedVersion}, current ${current?.version ?? 'unknown'}`,
    {
      currentVersion: current?.version,
      current,
      ...(opts?.code ? { code: opts.code } : {}),
    },
  );
}

/**
 * Run a Dynamo write; on optimistic conflict, re-read current and throw
 * ConflictError with `current` / `currentVersion` (one shared re-read path).
 */
export async function runVersionedWrite<TResult>(
  write: () => Promise<TResult>,
  conflictMessage: string,
  onConflict: () => Promise<never>,
  opts?: {
    slugClaimIndexes?: readonly number[];
    slugTakenMessage?: string;
  },
): Promise<TResult> {
  try {
    return await runDynamoWrite(write, conflictMessage, opts);
  } catch (error) {
    if (error instanceof ConflictError && error.code === 'slug_taken') {
      throw error;
    }
    if (error instanceof ConflictError || isOptimisticLockConflict(error)) {
      return await onConflict();
    }
    throw error;
  }
}
