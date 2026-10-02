/**
 * Map DynamoDB write failures using shared classification (CHR-120 / CHR-126).
 * Throttle retries are owned by the AWS SDK client — this only classifies.
 */
import { classifyDynamoWriteError } from '@gagnechris/data';
import { ConflictError, ServiceUnavailableError } from './errors.js';

function cancellationCodes(error: unknown): Array<string | undefined> {
  if (typeof error !== 'object' || error === null) return [];
  const reasons = (error as { CancellationReasons?: unknown })
    .CancellationReasons;
  if (!Array.isArray(reasons)) return [];
  return reasons.map((reason) => {
    if (
      typeof reason === 'object' &&
      reason !== null &&
      typeof (reason as { Code?: unknown }).Code === 'string'
    ) {
      return (reason as { Code: string }).Code;
    }
    return undefined;
  });
}

/**
 * True when a TransactWrite cancellation failed on a unique-claim Put
 * (ConditionalCheckFailed at one of the given item indexes).
 */
export function isUniqueClaimCancellation(
  error: unknown,
  claimIndexes: readonly number[],
): boolean {
  if (claimIndexes.length === 0) return false;
  const codes = cancellationCodes(error);
  if (codes.length === 0) return false;
  return claimIndexes.some(
    (index) => codes[index] === 'ConditionalCheckFailed',
  );
}

/** @deprecated Prefer {@link isUniqueClaimCancellation}. */
export function isSlugClaimCancellation(
  error: unknown,
  slugClaimIndexes: readonly number[],
): boolean {
  return isUniqueClaimCancellation(error, slugClaimIndexes);
}

/**
 * Run a DynamoDB write once; map conflict → ConflictError (409),
 * throttling → ServiceUnavailableError (503), other → rethrow.
 *
 * When `uniqueClaimIndexes` / `slugClaimIndexes` matches a
 * ConditionalCheckFailed cancellation, throws ConflictError with the
 * configured claim code (`slug_taken` by default for slug indexes).
 *
 * If `versionItemIndex` also failed, prefer a plain version conflict so
 * callers can attach `current` (CHR-170).
 */
export async function runDynamoWrite<T>(
  write: () => Promise<T>,
  conflictMessage: string,
  opts?: {
    slugClaimIndexes?: readonly number[];
    slugTakenMessage?: string;
    uniqueClaimIndexes?: readonly number[];
    uniqueClaimCode?: 'slug_taken' | 'daily_taken';
    uniqueClaimMessage?: string;
    versionItemIndex?: number;
  },
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const kind = classifyDynamoWriteError(error);
    if (kind === 'conflict') {
      const claimIndexes =
        opts?.uniqueClaimIndexes ?? opts?.slugClaimIndexes ?? [];
      const claimFailed =
        claimIndexes.length > 0 &&
        isUniqueClaimCancellation(error, claimIndexes);
      const versionAlsoFailed =
        opts?.versionItemIndex !== undefined &&
        isUniqueClaimCancellation(error, [opts.versionItemIndex]);
      if (claimFailed && !versionAlsoFailed) {
        throw new ConflictError(
          opts?.uniqueClaimMessage ?? opts?.slugTakenMessage ?? conflictMessage,
          { code: opts?.uniqueClaimCode ?? 'slug_taken' },
        );
      }
      throw new ConflictError(conflictMessage);
    }
    if (kind === 'throttling') {
      throw new ServiceUnavailableError(
        'DynamoDB is throttling; please retry shortly',
      );
    }
    throw error;
  }
}
