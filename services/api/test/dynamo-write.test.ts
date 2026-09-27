import { describe, expect, it, vi } from 'vitest';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { ConflictError, ServiceUnavailableError } from '../src/data/errors.js';
import { runDynamoWrite } from '../src/data/dynamo-write.js';

describe('runDynamoWrite (CHR-120)', () => {
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

  it('retries throttling then throws ServiceUnavailableError', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn(async () => {
      throw new TransactionCanceledException({
        message: 'cancelled',
        $metadata: {},
        CancellationReasons: [{ Code: 'ThrottlingError' }],
      });
    });

    await expect(
      runDynamoWrite(write, 'conflict', { maxAttempts: 3, sleep }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(write).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('does not map throttling to ConflictError', async () => {
    await expect(
      runDynamoWrite(
        async () => {
          throw new TransactionCanceledException({
            message: 'cancelled',
            $metadata: {},
            CancellationReasons: [{ Code: 'ThrottlingError' }],
          });
        },
        'would-be-conflict',
        { maxAttempts: 1, sleep: async () => undefined },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
