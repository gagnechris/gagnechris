/**
 * Map / retry DynamoDB writes using shared classification (CHR-120).
 */
import {
  classifyDynamoWriteError,
  type DynamoWriteErrorKind,
} from '@gagnechris/shared';
import { ConflictError, ServiceUnavailableError } from './errors.js';

export const DYNAMO_WRITE_MAX_ATTEMPTS = 3;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mapDynamoWriteFailure(
  kind: DynamoWriteErrorKind,
  conflictMessage: string,
): never {
  if (kind === 'conflict') {
    throw new ConflictError(conflictMessage);
  }
  if (kind === 'throttling') {
    throw new ServiceUnavailableError(
      'DynamoDB is throttling; please retry shortly',
    );
  }
  throw new Error(`Unexpected DynamoDB write failure kind: ${kind}`);
}

/**
 * Run a DynamoDB write; retry throttling with backoff, map conflict → ConflictError,
 * exhausted throttling → ServiceUnavailableError, other → rethrow.
 */
export async function runDynamoWrite<T>(
  write: () => Promise<T>,
  conflictMessage: string,
  options?: {
    maxAttempts?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DYNAMO_WRITE_MAX_ATTEMPTS;
  const sleep = options?.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await write();
    } catch (error) {
      lastError = error;
      const kind = classifyDynamoWriteError(error);
      if (kind === 'conflict') {
        throw new ConflictError(conflictMessage);
      }
      if (kind === 'throttling' && attempt < maxAttempts) {
        await sleep(25 * 2 ** (attempt - 1));
        continue;
      }
      if (kind === 'throttling') {
        throw new ServiceUnavailableError(
          'DynamoDB is throttling; please retry shortly',
        );
      }
      throw error;
    }
  }

  throw lastError;
}
