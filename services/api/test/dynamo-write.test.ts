import { describe, expect, it, vi } from 'vitest';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { ConflictError, ServiceUnavailableError } from '../src/data/errors.js';
import { runDynamoWrite } from '../src/data/dynamo-write.js';

describe('runDynamoWrite (CHR-120 / CHR-126)', () => {
  it('maps TransactionConflict to ConflictError', async () => {
    await expect(
      runDynamoWrite(async () => {
        throw new TransactionCanceledException({
          message: 'cancelled',
          $metadata: {},
          CancellationReasons: [{ Code: 'TransactionConflict' }],
        });
      }, 'boom'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps throttling to ServiceUnavailableError without local retries', async () => {
    const write = vi.fn(async () => {
      throw new TransactionCanceledException({
        message: 'cancelled',
        $metadata: {},
        CancellationReasons: [{ Code: 'ThrottlingError' }],
      });
    });

    await expect(runDynamoWrite(write, 'conflict')).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('maps RequestLimitExceeded to ServiceUnavailableError (CHR-126)', async () => {
    await expect(
      runDynamoWrite(async () => {
        const err = new Error('Rate exceeded');
        err.name = 'RequestLimitExceeded';
        throw err;
      }, 'conflict'),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('does not map throttling to ConflictError', async () => {
    await expect(
      runDynamoWrite(async () => {
        throw new TransactionCanceledException({
          message: 'cancelled',
          $metadata: {},
          CancellationReasons: [{ Code: 'ThrottlingError' }],
        });
      }, 'would-be-conflict'),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
