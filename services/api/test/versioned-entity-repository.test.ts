import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  VersionedEntityRepository,
  type VersionedEntity,
} from '../src/data/versioned-entity-repository.js';
import { ConflictError } from '../src/data/errors.js';
import { decodeCursor, encodeCursor } from '../src/data/cursor.js';

type Note = VersionedEntity & {
  id: string;
  title: string;
  deleted?: boolean;
};

type NoteItem = {
  pk: string;
  sk: string;
  id: string;
  title: string;
  version: number;
  updatedAt: string;
  deleted?: boolean;
};

function createNotesRepo(doc: { send: ReturnType<typeof vi.fn> }) {
  return new VersionedEntityRepository<Note, NoteItem>(
    {
      conflictLabel: 'note',
      keyForId: (id) => ({ pk: `NOTE#${id}`, sk: 'META' }),
      idOf: (n) => n.id,
      toEntity: (item) => ({
        id: item.id,
        title: item.title,
        version: item.version,
        updatedAt: item.updatedAt,
        deleted: item.deleted,
      }),
      toItem: (n) => ({
        pk: `NOTE#${n.id}`,
        sk: 'META',
        id: n.id,
        title: n.title,
        version: n.version,
        updatedAt: n.updatedAt,
        deleted: n.deleted,
      }),
      isDeleted: (n) => n.deleted === true,
    },
    doc as never,
    'test-table',
  );
}

describe('VersionedEntityRepository (fake note)', () => {
  const send = vi.fn();
  const repo = createNotesRepo({ send });

  beforeEach(() => {
    send.mockReset();
  });

  it('creates and gets a note', async () => {
    send.mockResolvedValueOnce({});
    const created = await repo.create({
      id: 'n1',
      title: 'Hello',
      version: 1,
      updatedAt: '2026-09-28T00:00:00.000Z',
    });
    expect(created.id).toBe('n1');
    expect(send.mock.calls[0]![0]).toBeInstanceOf(PutCommand);

    send.mockResolvedValueOnce({
      Item: {
        pk: 'NOTE#n1',
        sk: 'META',
        id: 'n1',
        title: 'Hello',
        version: 1,
        updatedAt: '2026-09-28T00:00:00.000Z',
      },
    });
    const got = await repo.get('n1');
    expect(got?.title).toBe('Hello');
    expect(send.mock.calls[1]![0]).toBeInstanceOf(GetCommand);
  });

  it('updateIfVersion returns conflict with current entity', async () => {
    send
      // getRawItem (preserve createHash)
      .mockResolvedValueOnce({
        Item: {
          pk: 'NOTE#n1',
          sk: 'META',
          id: 'n1',
          title: 'Old',
          version: 2,
          updatedAt: '2026-09-28T00:00:00.000Z',
        },
      })
      .mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      .mockResolvedValueOnce({
        Item: {
          pk: 'NOTE#n1',
          sk: 'META',
          id: 'n1',
          title: 'Server',
          version: 3,
          updatedAt: '2026-09-28T00:00:00.000Z',
        },
      });

    await expect(
      repo.updateIfVersion('n1', 2, {
        id: 'n1',
        title: 'Client',
        version: 3,
        updatedAt: '2026-09-28T00:00:01.000Z',
      }),
    ).rejects.toMatchObject({
      name: 'ConflictError',
      currentVersion: 3,
      current: expect.objectContaining({ title: 'Server', version: 3 }),
    } satisfies Partial<ConflictError>);
  });

  it('refuses to recreate a hard-deleted item', async () => {
    send
      // getRawItem (preserve createHash) — item already gone
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce({ name: 'ConditionalCheckFailedException' })
      .mockResolvedValueOnce({}); // GetItem: gone

    await expect(
      repo.updateIfVersion('n1', 1, {
        id: 'n1',
        title: 'Resurrected',
        version: 2,
        updatedAt: '2026-09-28T00:00:01.000Z',
      }),
    ).rejects.toMatchObject({
      name: 'ConflictError',
      message: expect.stringContaining('current unknown'),
    });

    const put = send.mock.calls[1]![0] as {
      input: { ConditionExpression?: string };
    };
    expect(put.input.ConditionExpression).toBe(
      'attribute_exists(pk) AND (version = :v OR (attribute_not_exists(version) AND :v = :zero))',
    );
  });

  it('queryPage follows LastEvaluatedKey via opaque cursor', async () => {
    send.mockResolvedValueOnce({
      Items: [
        {
          pk: 'NOTE#n1',
          sk: 'META',
          id: 'n1',
          title: 'A',
          version: 1,
          updatedAt: '2026-09-28T00:00:00.000Z',
        },
      ],
      LastEvaluatedKey: { pk: 'NOTE#n1', sk: 'META' },
    });
    const page = await repo.queryPage({
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'NOTE#n1' },
      limit: 1,
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    expect(decodeCursor(page.nextCursor)).toEqual({
      pk: 'NOTE#n1',
      sk: 'META',
    });
  });

  it('hides soft-deleted notes from get', async () => {
    send.mockResolvedValueOnce({
      Item: {
        pk: 'NOTE#n1',
        sk: 'META',
        id: 'n1',
        title: 'Gone',
        version: 2,
        updatedAt: '2026-09-28T00:00:00.000Z',
        deleted: true,
      },
    });
    expect(await repo.get('n1')).toBeUndefined();
  });
});

describe('cursor helpers', () => {
  it('round-trips LastEvaluatedKey', () => {
    const key = { pk: 'POST#1', sk: 'META' };
    const cursor = encodeCursor(key);
    expect(cursor).toBeTruthy();
    expect(decodeCursor(cursor)).toEqual(key);
  });

  it('rejects cursor missing required keys', () => {
    const cursor = encodeCursor({ pk: 'POST#1', sk: 'META' });
    expect(() =>
      decodeCursor(cursor, ['pk', 'sk', 'gsi1pk', 'gsi1sk']),
    ).toThrow(SyntaxError);
  });

  it('rejects cursor with extra keys', () => {
    const cursor = encodeCursor({
      pk: 'POST#1',
      sk: 'META',
      gsi1pk: 'STATUS#draft',
      gsi1sk: 'x',
      extra: 'nope',
    });
    expect(() =>
      decodeCursor(cursor, ['pk', 'sk', 'gsi1pk', 'gsi1sk']),
    ).toThrow(SyntaxError);
  });

  it('rejects cursor with non-string values', () => {
    const cursor = Buffer.from(
      JSON.stringify({ pk: 1, sk: 'META' }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeCursor(cursor, ['pk', 'sk'])).toThrow(SyntaxError);
  });
});

describe('VersionedEntityRepository queryPage tombstones', () => {
  it('filters soft-deleted entities from queryPage', async () => {
    const send = vi.fn().mockResolvedValueOnce({
      Items: [
        {
          pk: 'NOTE#n1',
          sk: 'META',
          id: 'n1',
          title: 'Alive',
          version: 1,
          updatedAt: '2026-09-28T00:00:00.000Z',
        },
        {
          pk: 'NOTE#n2',
          sk: 'META',
          id: 'n2',
          title: 'Gone',
          version: 2,
          updatedAt: '2026-09-28T00:00:00.000Z',
          deleted: true,
        },
      ],
    });
    const repo = new VersionedEntityRepository(
      {
        conflictLabel: 'note',
        keyForId: (id: string) => ({ pk: `NOTE#${id}`, sk: 'META' }),
        idOf: (n: { id: string }) => n.id,
        toEntity: (item: {
          id: string;
          title: string;
          version: number;
          updatedAt: string;
          deleted?: boolean;
        }) => ({
          id: item.id,
          title: item.title,
          version: item.version,
          updatedAt: item.updatedAt,
          deleted: item.deleted,
        }),
        toItem: (n: {
          id: string;
          title: string;
          version: number;
          updatedAt: string;
          deleted?: boolean;
        }) => ({
          pk: `NOTE#${n.id}`,
          sk: 'META',
          id: n.id,
          title: n.title,
          version: n.version,
          updatedAt: n.updatedAt,
          deleted: n.deleted,
        }),
        isDeleted: (n: { deleted?: boolean }) => n.deleted === true,
      },
      { send } as never,
      'test-table',
    );
    const page = await repo.queryPage({
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'NOTE#n1' },
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.title).toBe('Alive');
  });
});

describe('VersionedEntityRepository queryPage corrupt rows', () => {
  it('skips corrupt rows in queryPage (Zod → DataIntegrityError)', async () => {
    const send = vi.fn().mockResolvedValueOnce({
      Items: [
        {
          pk: 'NOTE#n1',
          sk: 'META',
          id: 'n1',
          version: 1,
          updatedAt: '2026-09-28T00:00:00.000Z',
        },
        {
          pk: 'NOTE#n2',
          sk: 'META',
          id: 'n2',
          title: 'Alive',
          version: 1,
          updatedAt: '2026-09-28T00:00:00.000Z',
        },
      ],
    });
    const { ZodError } = await import('zod');
    const repo = new VersionedEntityRepository(
      {
        conflictLabel: 'note',
        keyForId: (id: string) => ({ pk: `NOTE#${id}`, sk: 'META' }),
        idOf: (n: { id: string }) => n.id,
        toEntity: (item: {
          id: string;
          title?: string;
          version: number;
          updatedAt: string;
        }) => {
          if (typeof item.title !== 'string') {
            throw new ZodError([]);
          }
          return {
            id: item.id,
            title: item.title,
            version: item.version,
            updatedAt: item.updatedAt,
          };
        },
        toItem: (n: {
          id: string;
          title: string;
          version: number;
          updatedAt: string;
        }) => ({
          pk: `NOTE#${n.id}`,
          sk: 'META',
          id: n.id,
          title: n.title,
          version: n.version,
          updatedAt: n.updatedAt,
        }),
      },
      { send } as never,
      'test-table',
    );
    const page = await repo.queryPage({
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': 'NOTE#n1' },
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.title).toBe('Alive');
  });
});
