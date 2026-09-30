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
 * True when a TransactWrite cancellation failed on a slug-claim Put
 * (ConditionalCheckFailed at one of the given item indexes).
 */
export function isSlugClaimCancellation(
  error: unknown,
  slugClaimIndexes: readonly number[],
): boolean {
  if (slugClaimIndexes.length === 0) return false;
  const codes = cancellationCodes(error);
  if (codes.length === 0) return false;
  return slugClaimIndexes.some(
    (index) => codes[index] === 'ConditionalCheckFailed',
  );
}

/**
 * Run a DynamoDB write once; map conflict → ConflictError (409),
 * throttling → ServiceUnavailableError (503), other → rethrow.
 *
 * When `slugClaimIndexes` matches a ConditionalCheckFailed cancellation,
 * throws ConflictError with code `slug_taken`.
 */
export async function runDynamoWrite<T>(
  write: () => Promise<T>,
  conflictMessage: string,
  opts?: {
    slugClaimIndexes?: readonly number[];
    slugTakenMessage?: string;
  },
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const kind = classifyDynamoWriteError(error);
    if (kind === 'conflict') {
      if (
        opts?.slugClaimIndexes &&
        isSlugClaimCancellation(error, opts.slugClaimIndexes)
      ) {
        throw new ConflictError(opts.slugTakenMessage ?? conflictMessage, {
          code: 'slug_taken',
        });
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
