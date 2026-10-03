import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { GSI1_NAME, GSI2_NAME, keys } from '@gagnechris/data';
import {
  VersionedRepository,
  ownerScoped,
  type OwnerKey,
} from '../src/data/versioned-repository.js';
import { NotFoundError } from '../src/data/errors.js';
import {
  decodeCursor,
  GSI1_CURSOR_KEYS,
  GSI2_CURSOR_KEYS,
} from '../src/data/cursor.js';

type Note = {
  id: string;
  userId: string;
  title: string;
  version: number;
  updatedAt: string;
  deleted?: boolean;
  gsi1pk?: string;
  gsi1sk?: string;
};

type NoteItem = Note & { pk: string; sk: string };

function createRepo(doc: { send: ReturnType<typeof vi.fn> }) {
  return new VersionedRepository<Note, NoteItem, OwnerKey>(
    {
      conflictLabel: 'note',
      scope: ownerScoped({
        keyForId: (userId, id) => keys.notebook.note.meta(userId, id),
        idOf: (n) => n.id,
        userIdOf: (n) => n.userId,
      }),
      toEntity: (item) => ({
        id: item.id,
        userId: item.userId,
        title: item.title,
        version: item.version,
        updatedAt: item.updatedAt,
        deleted: item.deleted,
      }),
      toItem: (n) => ({
        pk: keys.notebook.note.meta(n.userId, n.id).pk,
        sk: 'META',
        id: n.id,
        userId: n.userId,
        title: n.title,
        version: n.version,
        updatedAt: n.updatedAt,
        deleted: n.deleted,
        ...(n.deleted
          ? {}
          : {
              gsi1pk: `USER#${n.userId}#AREA#work`,
              gsi1sk: `DATE#2026-10-02#NOTE#${n.id}`,
            }),
      }),
      isDeleted: (n) => n.deleted === true,
      cursorKeysByIndex: {
        [GSI1_NAME]: GSI1_CURSOR_KEYS,
        [GSI2_NAME]: GSI2_CURSOR_KEYS,
      },
    },
    doc as never,
    'test-table',
  );
}

describe('VersionedRepository with ownerScoped', () => {
  const send = vi.fn();
  const repo = createRepo({ send });

  beforeEach(() => {
    send.mockReset();
  });

  it('get hides other owners and missing rows', async () => {
    send.mockResolvedValueOnce({
      Item: {
        pk: 'USER#a#NOTE#n1',
        sk: 'META',
        id: 'n1',
        userId: 'b',
        title: 'leak',
        version: 1,
        updatedAt: '2026-10-02T00:00:00.000Z',
      },
    });
    expect(await repo.get({ userId: 'a', id: 'n1' })).toBeUndefined();
    expect(send.mock.calls[0]![0]).toBeInstanceOf(GetCommand);
  });

  it('updateIfVersion 404s when the owner key is missing', async () => {
    send.mockResolvedValueOnce({});
    await expect(
      repo.updateIfVersion({ userId: 'a', id: 'n1' }, 1, {
        id: 'n1',
        userId: 'a',
        title: 'x',
        version: 2,
        updatedAt: '2026-10-02T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('softDelete strips list GSI keys on the written tombstone', async () => {
    send
      .mockResolvedValueOnce({
        Item: {
          pk: 'USER#a#NOTE#n1',
          sk: 'META',
          id: 'n1',
          userId: 'a',
          title: 'x',
          version: 1,
          updatedAt: '2026-10-02T00:00:00.000Z',
          gsi1pk: 'USER#a#AREA#work',
          gsi1sk: 'DATE#2026-10-02#NOTE#n1',
        },
      })
      .mockResolvedValueOnce({});

    await repo.softDelete({ userId: 'a', id: 'n1' }, 1, {
      id: 'n1',
      userId: 'a',
      title: 'x',
      version: 2,
      updatedAt: '2026-10-02T01:00:00.000Z',
      deleted: true,
    });

    const cmd = send.mock.calls[1]![0] as TransactWriteCommand;
    expect(cmd).toBeInstanceOf(TransactWriteCommand);
    const item = cmd.input.TransactItems?.[0]?.Put?.Item as Record<
      string,
      unknown
    >;
    expect(item.deleted).toBe(true);
    expect(item.gsi1pk).toBeUndefined();
    expect(item.gsi1sk).toBeUndefined();
  });

  it('queryPage selects cursor keys by IndexName', async () => {
    send.mockResolvedValueOnce({
      Items: [
        {
          pk: 'USER#a#NOTE#n1',
          sk: 'META',
          id: 'n1',
          userId: 'a',
          title: 'A',
          version: 1,
          updatedAt: '2026-10-02T00:00:00.000Z',
          gsi1pk: 'USER#a#AREA#work',
          gsi1sk: 'DATE#2026-10-01#NOTE#n1',
        },
      ],
      LastEvaluatedKey: {
        pk: 'USER#a#NOTE#n1',
        sk: 'META',
        gsi1pk: 'USER#a#AREA#work',
        gsi1sk: 'DATE#2026-10-01#NOTE#n1',
      },
    });

    const page = await repo.queryPage({
      IndexName: GSI1_NAME,
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: { ':pk': 'USER#a#AREA#work' },
      limit: 1,
    });
    expect(page.items).toHaveLength(1);
    expect(decodeCursor(page.nextCursor, GSI1_CURSOR_KEYS)).toEqual({
      pk: 'USER#a#NOTE#n1',
      sk: 'META',
      gsi1pk: 'USER#a#AREA#work',
      gsi1sk: 'DATE#2026-10-01#NOTE#n1',
    });
    expect(send.mock.calls[0]![0]).toBeInstanceOf(QueryCommand);
  });

  it('mutateIfVersion reads consistently and always writes expected + 1', async () => {
    const stored = {
      pk: keys.notebook.note.meta('a', 'n1').pk,
      sk: 'META',
      id: 'n1',
      userId: 'a',
      title: 'live',
      version: 2,
      updatedAt: '2026-10-02T12:00:00.000Z',
    };
    send.mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof GetCommand) return { Item: stored };
      return {};
    });

    // A builder that echoes a stale version must not leak it into the write.
    const next = await repo.mutateIfVersion(
      { userId: 'a', id: 'n1' },
      'any',
      (n) => ({
        ...n,
        title: `${n.title}!`,
        version: 1,
      }),
    );

    expect(next).toMatchObject({ title: 'live!', version: 3 });
    const get = send.mock.calls[0]![0] as GetCommand;
    expect(get.input.ConsistentRead).toBe(true);
    const put = send.mock.calls[1]![0] as {
      input: {
        Item: { version: number };
        ExpressionAttributeValues: Record<string, number>;
      };
    };
    expect(put.input.Item.version).toBe(3);
    expect(put.input.ExpressionAttributeValues[':v']).toBe(2);
  });

  it('mutateIfVersion on a tombstone is 404', async () => {
    send.mockResolvedValueOnce({
      Item: {
        pk: keys.notebook.note.meta('a', 'n1').pk,
        sk: 'META',
        id: 'n1',
        userId: 'a',
        title: 'gone',
        version: 3,
        updatedAt: '2026-10-02T12:00:00.000Z',
        deleted: true,
      },
    });
    await expect(
      repo.mutateIfVersion({ userId: 'a', id: 'n1' }, 3, (n) => n),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
