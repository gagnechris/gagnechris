import { describe, expect, it, vi } from 'vitest';
import {
  batchGetAll,
  classifyDynamoWriteError,
  isOptimisticLockConflict,
  type BatchGetOutput,
  type BatchGetRequestItems,
} from './dynamodb.js';

describe('batchGetAll', () => {
  it('retries UnprocessedKeys until empty and merges responses', async () => {
    const calls: BatchGetRequestItems[] = [];
    const sleep = vi.fn().mockResolvedValue(undefined);

    const send = vi.fn(
      async (requestItems: BatchGetRequestItems): Promise<BatchGetOutput> => {
        calls.push(requestItems);
        if (calls.length === 1) {
          return {
            Responses: {
              t: [{ pk: 'POST#1', sk: 'PUBLISHED', postId: '1' }],
            },
            UnprocessedKeys: {
              t: { Keys: [{ pk: 'POST#2', sk: 'PUBLISHED' }] },
            },
          };
        }
        return {
          Responses: {
            t: [{ pk: 'POST#2', sk: 'PUBLISHED', postId: '2' }],
          },
        };
      },
    );

    const result = await batchGetAll(
      send,
      {
        t: {
          Keys: [
            { pk: 'POST#1', sk: 'PUBLISHED' },
            { pk: 'POST#2', sk: 'PUBLISHED' },
          ],
        },
      },
      { sleep },
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(result.t).toEqual([
      { pk: 'POST#1', sk: 'PUBLISHED', postId: '1' },
      { pk: 'POST#2', sk: 'PUBLISHED', postId: '2' },
    ]);
    expect(calls[1]).toEqual({
      t: { Keys: [{ pk: 'POST#2', sk: 'PUBLISHED' }] },
    });
  });

  it('throws when UnprocessedKeys remain after max attempts', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn(async (): Promise<BatchGetOutput> => ({
      Responses: { t: [] },
      UnprocessedKeys: {
        t: { Keys: [{ pk: 'POST#1', sk: 'PUBLISHED' }] },
      },
    }));

    await expect(
      batchGetAll(
        send,
        { t: { Keys: [{ pk: 'POST#1', sk: 'PUBLISHED' }] } },
        { maxAttempts: 3, sleep },
      ),
    ).rejects.toThrow(/UnprocessedKeys after 3 attempts/);
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

describe('classifyDynamoWriteError', () => {
  it('maps ConditionalCheckFailed and TransactionConflict to conflict', () => {
    expect(
      classifyDynamoWriteError({ name: 'ConditionalCheckFailedException' }),
    ).toBe('conflict');
    expect(
      classifyDynamoWriteError({
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'TransactionConflict' }],
      }),
    ).toBe('conflict');
    expect(
      classifyDynamoWriteError({
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
      }),
    ).toBe('conflict');
    expect(
      isOptimisticLockConflict({
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'TransactionConflict' }],
      }),
    ).toBe(true);
  });

  it('maps throttling reasons and RequestLimitExceeded to throttling (not conflict)', () => {
    expect(
      classifyDynamoWriteError({
        name: 'ProvisionedThroughputExceededException',
      }),
    ).toBe('throttling');
    expect(
      classifyDynamoWriteError({
        name: 'RequestLimitExceeded',
      }),
    ).toBe('throttling');
    expect(
      classifyDynamoWriteError({
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ThrottlingError' }],
      }),
    ).toBe('throttling');
    expect(
      isOptimisticLockConflict({
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ThrottlingError' }],
      }),
    ).toBe(false);
  });

  it('returns other for unknown cancellation codes', () => {
    expect(
      classifyDynamoWriteError({
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ValidationError' }],
      }),
    ).toBe('other');
  });
});
