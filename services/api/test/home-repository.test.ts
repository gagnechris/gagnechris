import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_HOME, type Home } from '@gagnechris/shared';
import { ConflictError } from '../src/data/errors.js';
import { buildHomeMetaItem, buildHomePublishedItem } from '../src/home/keys.js';
import { HomeRepository } from '../src/home/repository.js';

const stored: Home = {
  ...DEFAULT_HOME,
  status: 'published',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 3,
  hasUnpublishedChanges: false,
};

type FakeCommand = {
  constructor: { name: string };
  input: Record<string, unknown>;
};

function itemsForKeys(
  keys: Array<{ sk?: string }>,
  meta: unknown,
  published: unknown | undefined,
): unknown[] {
  const out: unknown[] = [];
  for (const key of keys) {
    if (key.sk === 'META' && meta) out.push(meta);
    if (key.sk === 'PUBLISHED' && published) out.push(published);
  }
  return out;
}

/** Respond to BatchGet (META+PUBLISHED) and optional writes (CHR-117). */
function mockPair(
  meta: unknown,
  published?: unknown,
  onWrite?: (command: FakeCommand) => Promise<unknown> | unknown,
): (command: FakeCommand) => Promise<unknown> {
  return async (command) => {
    if (command.constructor.name === 'BatchGetCommand') {
      const requestItems = command.input.RequestItems as Record<
        string,
        { Keys: Array<{ sk?: string }> }
      >;
      const table = Object.keys(requestItems)[0]!;
      const keys = requestItems[table]!.Keys;
      return {
        Responses: { [table]: itemsForKeys(keys, meta, published) },
      };
    }
    if (command.constructor.name === 'GetCommand') {
      const key = command.input.Key as { sk?: string };
      if (key.sk === 'PUBLISHED') {
        return published ? { Item: published } : {};
      }
      return meta ? { Item: meta } : {};
    }
    if (onWrite) {
      return (await onWrite(command)) ?? {};
    }
    return {};
  };
}

function mockDoc(impl: (command: FakeCommand) => Promise<unknown>) {
  const send = vi.fn(async (command: FakeCommand) => impl(command));
  return {
    doc: { send } as unknown as DynamoDBDocumentClient,
    send,
  };
}

describe('HomeRepository', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'gagnechris-test';
  });

  it('reads the singleton by key', async () => {
    const { doc, send } = mockDoc(
      mockPair(buildHomeMetaItem(stored), buildHomePublishedItem(stored)),
    );
    const home = await new HomeRepository(doc, 'gagnechris-test').get();
    expect(home?.version).toBe(3);
    expect(home?.hasUnpublishedChanges).toBe(false);
    expect(send.mock.calls[0]![0]!.constructor.name).toBe('BatchGetCommand');
    const keys = (
      send.mock.calls[0]![0]!.input.RequestItems as Record<
        string,
        { Keys: unknown[] }
      >
    )['gagnechris-test']!.Keys;
    expect(keys).toEqual([
      { pk: 'HOME#current', sk: 'META' },
      { pk: 'HOME#current', sk: 'PUBLISHED' },
    ]);
  });

  it('seeds a draft home on first read (not published)', async () => {
    const { doc, send } = mockDoc(mockPair(undefined, undefined));
    const home = await new HomeRepository(doc, 'gagnechris-test').getOrCreate();
    expect(home.status).toBe('draft');
    expect(home.publishedAt).toBeNull();
    expect(home.hasUnpublishedChanges).toBe(false);
    expect(home.version).toBe(1);
    expect(home.about).toContain('Engineering Leader at Ro');

    const put = send.mock.calls.find(
      (c) => c[0]!.constructor.name === 'PutCommand',
    )![0]!;
    expect(put.input.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect(
      (put.input.Item as { entityType: string; status: string }).entityType,
    ).toBe('home');
    expect((put.input.Item as { status: string }).status).toBe('draft');
    expect(put.input.Item).not.toHaveProperty('gsi1pk');
  });

  it('updates draft only and marks unpublished changes when live', async () => {
    const { doc, send } = mockDoc(
      mockPair(buildHomeMetaItem(stored), buildHomePublishedItem(stored)),
    );
    const next = await new HomeRepository(doc, 'gagnechris-test').update({
      version: 3,
      about: 'New about copy.',
      title: 'Engineering Director',
    });
    expect(next.about).toBe('New about copy.');
    expect(next.title).toBe('Engineering Director');
    expect(next.name).toBe(stored.name);
    expect(next.version).toBe(4);
    expect(next.status).toBe('published');
    expect(next.hasUnpublishedChanges).toBe(true);
    const put = send.mock.calls.find(
      (c) => c[0]!.constructor.name === 'PutCommand',
    )![0]!;
    expect(put.input.ExpressionAttributeValues).toEqual({ ':v': 3 });
    expect((put.input.Item as { sk: string }).sk).toBe('META');
  });

  it('rejects a stale version', async () => {
    const { doc } = mockDoc(
      mockPair(buildHomeMetaItem(stored), buildHomePublishedItem(stored)),
    );
    await expect(
      new HomeRepository(doc, 'gagnechris-test').update({ version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps a failed conditional write to a conflict', async () => {
    const { doc } = mockDoc(
      mockPair(
        buildHomeMetaItem(stored),
        buildHomePublishedItem(stored),
        async (command) => {
          if (command.constructor.name === 'PutCommand') {
            throw new ConditionalCheckFailedException({
              message: 'conditional request failed',
              $metadata: {},
            });
          }
          return {};
        },
      ),
    );
    await expect(
      new HomeRepository(doc, 'gagnechris-test').update({ version: 3 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps TransactionCanceledException on publish to a 409 conflict', async () => {
    const draft: Home = {
      ...stored,
      about: 'Edited about',
      version: 4,
    };
    const { doc } = mockDoc(
      mockPair(
        buildHomeMetaItem(draft),
        buildHomePublishedItem(stored),
        async (command) => {
          if (command.constructor.name === 'TransactWriteCommand') {
            throw new TransactionCanceledException({
              message: 'Transaction cancelled',
              $metadata: {},
              CancellationReasons: [
                { Code: 'ConditionalCheckFailed', Message: 'version' },
                { Code: 'None' },
              ],
            });
          }
          return {};
        },
      ),
    );
    await expect(
      new HomeRepository(doc, 'gagnechris-test').publish(),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps TransactionConflict cancellation to a 409 conflict (CHR-120)', async () => {
    const draft: Home = {
      ...stored,
      about: 'Edited about',
      version: 4,
    };
    const { doc } = mockDoc(
      mockPair(
        buildHomeMetaItem(draft),
        buildHomePublishedItem(stored),
        async (command) => {
          if (command.constructor.name === 'TransactWriteCommand') {
            throw new TransactionCanceledException({
              message: 'Transaction cancelled',
              $metadata: {},
              CancellationReasons: [
                { Code: 'TransactionConflict', Message: 'concurrent' },
                { Code: 'None' },
              ],
            });
          }
          return {};
        },
      ),
    );
    await expect(
      new HomeRepository(doc, 'gagnechris-test').publish(),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('retries BatchGet UnprocessedKeys before treating PUBLISHED as missing (CHR-120)', async () => {
    let batchCalls = 0;
    const { doc, send } = mockDoc(async (command) => {
      if (command.constructor.name === 'BatchGetCommand') {
        batchCalls += 1;
        const requestItems = command.input.RequestItems as Record<
          string,
          { Keys: Array<{ sk?: string }> }
        >;
        const table = Object.keys(requestItems)[0]!;
        if (batchCalls === 1) {
          return {
            Responses: {
              [table]: [buildHomeMetaItem(stored)],
            },
            UnprocessedKeys: {
              [table]: {
                Keys: [{ pk: 'HOME#current', sk: 'PUBLISHED' }],
              },
            },
          };
        }
        return {
          Responses: {
            [table]: [buildHomePublishedItem(stored)],
          },
        };
      }
      return {};
    });

    const home = await new HomeRepository(doc, 'gagnechris-test').get();
    expect(home?.hasUnpublishedChanges).toBe(false);
    expect(batchCalls).toBe(2);
    expect(
      send.mock.calls.filter(
        (c) => c[0]!.constructor.name === 'BatchGetCommand',
      ),
    ).toHaveLength(2);
  });

  it('publish copies draft to PUBLISHED when content changed', async () => {
    const draft: Home = {
      ...stored,
      about: 'Edited about',
      version: 4,
    };
    const { doc, send } = mockDoc(
      mockPair(buildHomeMetaItem(draft), buildHomePublishedItem(stored)),
    );
    const home = await new HomeRepository(doc, 'gagnechris-test').publish();
    expect(home.status).toBe('published');
    expect(home.about).toBe('Edited about');
    expect(home.hasUnpublishedChanges).toBe(false);
    expect(home.version).toBe(5);
    const tx = send.mock.calls.find(
      (c) => c[0]!.constructor.name === 'TransactWriteCommand',
    )![0]!;
    const items = tx.input.TransactItems as Array<{
      Put?: { Item: { sk: string } };
    }>;
    expect(items.map((i) => i.Put?.Item.sk).sort()).toEqual([
      'META',
      'PUBLISHED',
    ]);
  });

  it('publish is a no-op when draft matches published snapshot', async () => {
    const { doc, send } = mockDoc(
      mockPair(buildHomeMetaItem(stored), buildHomePublishedItem(stored)),
    );
    const home = await new HomeRepository(doc, 'gagnechris-test').publish();
    expect(home.version).toBe(3);
    expect(home.hasUnpublishedChanges).toBe(false);
    expect(
      send.mock.calls.some(
        (c) => c[0]!.constructor.name === 'TransactWriteCommand',
      ),
    ).toBe(false);
  });

  it('unpublish deletes PUBLISHED and keeps publishedAt', async () => {
    const { doc, send } = mockDoc(
      mockPair(buildHomeMetaItem(stored), buildHomePublishedItem(stored)),
    );
    const home = await new HomeRepository(doc, 'gagnechris-test').unpublish();
    expect(home.status).toBe('draft');
    expect(home.publishedAt).toBe(stored.publishedAt);
    expect(home.version).toBe(4);
    const tx = send.mock.calls.find(
      (c) => c[0]!.constructor.name === 'TransactWriteCommand',
    )![0]!;
    const items = tx.input.TransactItems as Array<Record<string, unknown>>;
    expect(items.some((i) => 'Delete' in i)).toBe(true);
  });

  it('discard restores META from PUBLISHED', async () => {
    const draft: Home = { ...stored, about: 'Dirty draft', version: 5 };
    const { doc } = mockDoc(
      mockPair(buildHomeMetaItem(draft), buildHomePublishedItem(stored)),
    );
    const home = await new HomeRepository(doc, 'gagnechris-test').discard();
    expect(home.about).toBe(stored.about);
    expect(home.hasUnpublishedChanges).toBe(false);
    expect(home.version).toBe(6);
  });

  it('migrates legacy published META to PUBLISHED without changing content', async () => {
    const puts: unknown[] = [];
    const { doc } = mockDoc(
      mockPair(buildHomeMetaItem(stored), undefined, async (command) => {
        if (command.constructor.name === 'PutCommand') {
          puts.push(command.input.Item);
        }
        return {};
      }),
    );
    const home = await new HomeRepository(doc, 'gagnechris-test').get();
    expect(home?.hasUnpublishedChanges).toBe(false);
    expect(puts).toHaveLength(1);
    expect((puts[0] as { sk: string }).sk).toBe('PUBLISHED');
  });

  it('loads META and PUBLISHED in one BatchGet (no redundant GetItem)', async () => {
    const { doc, send } = mockDoc(
      mockPair(buildHomeMetaItem(stored), buildHomePublishedItem(stored)),
    );
    await new HomeRepository(doc, 'gagnechris-test').get();
    const gets = send.mock.calls.filter(
      (c) => c[0]!.constructor.name === 'GetCommand',
    );
    const batches = send.mock.calls.filter(
      (c) => c[0]!.constructor.name === 'BatchGetCommand',
    );
    expect(gets).toHaveLength(0);
    expect(batches).toHaveLength(1);
  });
});
