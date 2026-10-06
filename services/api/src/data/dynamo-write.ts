// Throttle retries are owned by the AWS SDK client; this only classifies.
import {
  classifyDynamoWriteError,
  transactionCancellationCodes,
} from '@gagnechris/data';
import { ConflictError, ServiceUnavailableError } from './errors.js';

export function isUniqueClaimCancellation(
  error: unknown,
  claimIndexes: readonly number[],
): boolean {
  if (claimIndexes.length === 0) return false;
  const codes = transactionCancellationCodes(error);
  return claimIndexes.some(
    (index) => codes[index] === 'ConditionalCheckFailed',
  );
}

/** Lost to a concurrent transaction on one of the items, not a failed condition. */
export function isTransactionConflict(error: unknown): boolean {
  return transactionCancellationCodes(error).includes('TransactionConflict');
}

export const TRANSACTION_CONFLICT_RETRIES = 4;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries a transaction that lost only to a concurrent one (no failed
 * condition). A canceled transaction applied nothing, so it is safe to resend.
 */
export async function retryTransactionConflicts<T>(
  write: () => Promise<T>,
  retries: number = TRANSACTION_CONFLICT_RETRIES,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      const codes = transactionCancellationCodes(error);
      if (
        attempt >= retries ||
        !codes.includes('TransactionConflict') ||
        codes.includes('ConditionalCheckFailed')
      ) {
        throw error;
      }
      // Full jitter on 20, 40, 80, 160 ms so racing writers spread out.
      await sleep(Math.random() * 20 * 2 ** attempt);
    }
  }
}

export type UniqueClaimWriteOptions = {
  /** TransactWrite indexes of the unique-claim Puts. */
  uniqueClaimIndexes?: readonly number[];
  uniqueClaimCode?: 'slug_taken' | 'daily_taken';
  uniqueClaimMessage?: string;
  /** TransactWrite index of the versioned Put (usually 0). */
  versionItemIndex?: number;
};

/** If `versionItemIndex` also failed, a plain version conflict wins so callers can attach `current`. */
export async function runDynamoWrite<T>(
  write: () => Promise<T>,
  conflictMessage: string,
  opts?: UniqueClaimWriteOptions,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const kind = classifyDynamoWriteError(error);
    if (kind === 'conflict') {
      const claimFailed = isUniqueClaimCancellation(
        error,
        opts?.uniqueClaimIndexes ?? [],
      );
      const versionAlsoFailed =
        opts?.versionItemIndex !== undefined &&
        isUniqueClaimCancellation(error, [opts.versionItemIndex]);
      if (claimFailed && !versionAlsoFailed) {
        throw new ConflictError(opts?.uniqueClaimMessage ?? conflictMessage, {
          code: opts?.uniqueClaimCode ?? 'slug_taken',
        });
      }
      throw new ConflictError(conflictMessage, { cause: error });
    }
    if (kind === 'throttling') {
      throw new ServiceUnavailableError(
        'DynamoDB is throttling; please retry shortly',
      );
    }
    throw error;
  }
}
