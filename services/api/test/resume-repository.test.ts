import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_RESUME, type Resume } from '@gagnechris/shared';
import { ConflictError } from '../src/data/errors.js';
import {
  buildResumeMetaItem,
  buildResumePublishedItem,
} from '../src/resume/keys.js';
import { ResumeRepository } from '../src/resume/repository.js';

const stored: Resume = {
  ...DEFAULT_RESUME,
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

describe('ResumeRepository', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'gagnechris-test';
  });

  it('reads the singleton by key', async () => {
    const { doc, send } = mockDoc(
      mockPair(buildResumeMetaItem(stored), buildResumePublishedItem(stored)),
    );
    const resume = await new ResumeRepository(doc, 'gagnechris-test').get();
    expect(resume?.version).toBe(3);
    expect(resume?.hasUnpublishedChanges).toBe(false);
    expect(send.mock.calls[0]![0]!.constructor.name).toBe('BatchGetCommand');
  });

  it('seeds a draft resume on first read (not published)', async () => {
    const { doc, send } = mockDoc(mockPair(undefined, undefined));
    const resume = await new ResumeRepository(
      doc,
      'gagnechris-test',
    ).getOrCreate();
    expect(resume.status).toBe('draft');
    expect(resume.publishedAt).toBeNull();
    expect(resume.hasUnpublishedChanges).toBe(false);
    expect(resume.version).toBe(1);

    const put = send.mock.calls.find(
      (c) => c[0]!.constructor.name === 'PutCommand',
    )![0]!;
    expect(put.input.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect((put.input.Item as { entityType: string }).entityType).toBe(
      'resume',
    );
    expect((put.input.Item as { status: string }).status).toBe('draft');
  });

  it('updates draft only and marks unpublished changes when live', async () => {
    const { doc, send } = mockDoc(
      mockPair(buildResumeMetaItem(stored), buildResumePublishedItem(stored)),
    );
    const next = await new ResumeRepository(doc, 'gagnechris-test').update({
      version: 3,
      name: 'Updated Name',
    });
    expect(next.name).toBe('Updated Name');
    expect(next.version).toBe(4);
    expect(next.status).toBe('published');
    expect(next.hasUnpublishedChanges).toBe(true);
    const put = send.mock.calls.find(
      (c) => c[0]!.constructor.name === 'PutCommand',
    )![0]!;
    expect((put.input.Item as { sk: string }).sk).toBe('META');
  });

  it('rejects a stale version', async () => {
    const { doc } = mockDoc(
      mockPair(buildResumeMetaItem(stored), buildResumePublishedItem(stored)),
    );
    await expect(
      new ResumeRepository(doc, 'gagnechris-test').update({ version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps a failed conditional write to a conflict', async () => {
    const { doc } = mockDoc(
      mockPair(
        buildResumeMetaItem(stored),
        buildResumePublishedItem(stored),
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
      new ResumeRepository(doc, 'gagnechris-test').update({ version: 3 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps TransactionCanceledException on publish to a 409 conflict', async () => {
    const draft: Resume = {
      ...stored,
      name: 'Edited Name',
      version: 4,
    };
    const { doc } = mockDoc(
      mockPair(
        buildResumeMetaItem(draft),
        buildResumePublishedItem(stored),
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
      new ResumeRepository(doc, 'gagnechris-test').publish(),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps TransactionConflict cancellation to a 409 conflict (CHR-120)', async () => {
    const draft: Resume = {
      ...stored,
      name: 'Edited Name',
      version: 4,
    };
    const { doc } = mockDoc(
      mockPair(
        buildResumeMetaItem(draft),
        buildResumePublishedItem(stored),
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
      new ResumeRepository(doc, 'gagnechris-test').publish(),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('publish copies draft to PUBLISHED when content changed', async () => {
    const draft: Resume = {
      ...stored,
      name: 'Edited Name',
      version: 4,
    };
    const { doc, send } = mockDoc(
      mockPair(buildResumeMetaItem(draft), buildResumePublishedItem(stored)),
    );
    const resume = await new ResumeRepository(doc, 'gagnechris-test').publish();
    expect(resume.status).toBe('published');
    expect(resume.name).toBe('Edited Name');
    expect(resume.hasUnpublishedChanges).toBe(false);
    expect(resume.version).toBe(5);
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
      mockPair(buildResumeMetaItem(stored), buildResumePublishedItem(stored)),
    );
    const resume = await new ResumeRepository(doc, 'gagnechris-test').publish();
    expect(resume.version).toBe(3);
    expect(
      send.mock.calls.some(
        (c) => c[0]!.constructor.name === 'TransactWriteCommand',
      ),
    ).toBe(false);
  });

  it('unpublish deletes PUBLISHED and keeps publishedAt', async () => {
    const { doc, send } = mockDoc(
      mockPair(buildResumeMetaItem(stored), buildResumePublishedItem(stored)),
    );
    const resume = await new ResumeRepository(
      doc,
      'gagnechris-test',
    ).unpublish();
    expect(resume.status).toBe('draft');
    expect(resume.publishedAt).toBe(stored.publishedAt);
    expect(resume.version).toBe(4);
    const tx = send.mock.calls.find(
      (c) => c[0]!.constructor.name === 'TransactWriteCommand',
    )![0]!;
    const items = tx.input.TransactItems as Array<Record<string, unknown>>;
    expect(items.some((i) => 'Delete' in i)).toBe(true);
  });

  it('loads META and PUBLISHED in one BatchGet (no redundant GetItem)', async () => {
    const { doc, send } = mockDoc(
      mockPair(buildResumeMetaItem(stored), buildResumePublishedItem(stored)),
    );
    await new ResumeRepository(doc, 'gagnechris-test').get();
    expect(
      send.mock.calls.filter((c) => c[0]!.constructor.name === 'GetCommand'),
    ).toHaveLength(0);
    expect(
      send.mock.calls.filter(
        (c) => c[0]!.constructor.name === 'BatchGetCommand',
      ),
    ).toHaveLength(1);
  });
});
