import { describe, expect, it, vi } from 'vitest';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { ConflictError, ServiceUnavailableError } from '../src/data/errors.js';
import {
  retryTransactionConflicts,
  runDynamoWrite,
} from '../src/data/dynamo-write.js';

describe('runDynamoWrite', () => {
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

  it('maps RequestLimitExceeded to ServiceUnavailableError', async () => {
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

const canceled = (...codes: string[]) =>
  new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: codes.map((Code) => ({ Code })),
  });

describe('retryTransactionConflicts', () => {
  it('does not resend when a condition also failed', async () => {
    const write = vi.fn(async () => {
      throw canceled('ConditionalCheckFailed', 'TransactionConflict');
    });
    await expect(retryTransactionConflicts(write)).rejects.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retries', async () => {
    const write = vi.fn(async () => {
      throw canceled('None', 'TransactionConflict');
    });
    await expect(retryTransactionConflicts(write, 2)).rejects.toThrow();
    expect(write).toHaveBeenCalledTimes(3);
  });
});
