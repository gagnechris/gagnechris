/**
 * Map DynamoDB write failures using shared classification (CHR-120 / CHR-126).
 * Throttle retries are owned by the AWS SDK client — this only classifies.
 */
import { classifyDynamoWriteError } from '@gagnechris/shared';
import { ConflictError, ServiceUnavailableError } from './errors.js';

/**
 * Run a DynamoDB write once; map conflict → ConflictError (409),
 * throttling → ServiceUnavailableError (503), other → rethrow.
 */
export async function runDynamoWrite<T>(
  write: () => Promise<T>,
  conflictMessage: string,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const kind = classifyDynamoWriteError(error);
    if (kind === 'conflict') {
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
