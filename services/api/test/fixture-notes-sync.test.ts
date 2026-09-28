import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { FixtureNotesRepository } from '../src/fixture-notes/repository.js';
import { SyncLedger } from '../src/sync/ledger.js';
import { createFixtureNoteRoutes } from '../src/fixture-notes/handlers.js';
import { createSyncRoutes } from '../src/sync/handlers.js';
import { dispatchRoutes } from '../src/router.js';
import { makeEvent } from './support/make-event.js';

const TABLE = 'gagnechris-test';
const USER = 'user-1';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function itemKey(item: { pk: string; sk: string }): string {
  return `${item.pk}\0${item.sk}`;
}

function createMemoryDoc(): {
  doc: DynamoDBDocumentClient;
  store: Map<string, Record<string, unknown>>;
} {
  const store = new Map<string, Record<string, unknown>>();

  const send = vi.fn(async (command: unknown) => {
    const cmd = command as {
      constructor: { name: string };
      input: Record<string, unknown>;
    };
    const name = cmd.constructor.name;

    if (name === 'GetCommand') {
      const key = cmd.input.Key as { pk: string; sk: string };
      const item = store.get(itemKey(key));
      return item ? { Item: { ...item } } : {};
    }

    if (name === 'PutCommand') {
      const item = cmd.input.Item as Record<string, unknown>;
      const key = { pk: item.pk as string, sk: item.sk as string };
      if (cmd.input.ConditionExpression === 'attribute_not_exists(pk)') {
        if (store.has(itemKey(key))) {
          throw { name: 'ConditionalCheckFailedException' };
        }
      }
      store.set(itemKey(key), { ...item });
      return {};
    }

    if (name === 'TransactWriteCommand') {
      const items = cmd.input.TransactItems as Array<{
        Put: {
          Item: Record<string, unknown>;
          ConditionExpression?: string;
          ExpressionAttributeValues?: Record<string, unknown>;
        };
      }>;
      const snapshot = new Map(store);
      try {
        for (const tx of items) {
          const put = tx.Put;
          const item = put.Item;
          const key = { pk: item.pk as string, sk: item.sk as string };
          const k = itemKey(key);
          const cond = put.ConditionExpression;
          if (cond === 'attribute_not_exists(pk)') {
            if (store.has(k)) {
              throw {
                name: 'TransactionCanceledException',
                CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
              };
            }
          } else if (cond?.includes('version = :v')) {
            const existing = store.get(k);
            const expected = put.ExpressionAttributeValues?.[':v'];
            if (
              !existing ||
              existing.version !== expected ||
              existing.userId !== put.ExpressionAttributeValues?.[':uid']
            ) {
              throw {
                name: 'TransactionCanceledException',
                CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
              };
            }
          }
          store.set(k, { ...item });
        }
        return {};
      } catch (error) {
        store.clear();
        for (const [k, v] of snapshot) store.set(k, v);
        throw error;
      }
    }

    if (name === 'QueryCommand') {
      const pk = (
        cmd.input.ExpressionAttributeValues as Record<string, string>
      )[':pk'];
      const sinceSk = (
        cmd.input.ExpressionAttributeValues as Record<string, string>
      )[':sinceSk'];
      const prefix = (
        cmd.input.ExpressionAttributeValues as Record<string, string>
      )[':tsPrefix'];
      let rows = [...store.values()].filter((item) => item.pk === pk);
      if (sinceSk) {
        rows = rows.filter((item) => (item.sk as string) > sinceSk);
      } else if (prefix) {
        rows = rows.filter((item) => (item.sk as string).startsWith(prefix));
      }
      rows.sort((a, b) => (a.sk as string).localeCompare(b.sk as string));
      const limit = cmd.input.Limit as number | undefined;
      const sliced = limit ? rows.slice(0, limit) : rows;
      return { Items: sliced.map((r) => ({ ...r })) };
    }

    throw new Error(`Unhandled command ${name}`);
  });

  return { doc: { send } as unknown as DynamoDBDocumentClient, store };
}

function adminEvent(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
  query?: Record<string, string>,
) {
  return makeEvent(method, path, {
    body,
    headers,
    query,
    jwtClaims: { sub: USER },
  });
}

describe('fixture notes sync (CHR-141)', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
  });

  it('create → update → delete appear in changes feed in order', async () => {
    const times = [
      '2026-09-28T10:00:00.000Z',
      '2026-09-28T11:00:00.000Z',
      '2026-09-28T12:00:00.000Z',
    ];
    let tick = 0;
    const nowIso = () => times[tick++] ?? times[times.length - 1]!;

    const { doc } = createMemoryDoc();
    const repo = new FixtureNotesRepository(doc, TABLE, nowIso);
    const ledger = new SyncLedger(doc, TABLE);
    const routes = [
      ...createFixtureNoteRoutes(repo),
      ...createSyncRoutes(ledger),
    ];

    const createRes = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/fixture-notes', {
        id: NOTE_ID,
        title: 'A',
        body: 'one',
      }),
      'POST',
      '/api/notebook/fixture-notes',
      { enforceAuth: true },
    );
    expect(createRes?.statusCode).toBe(201);
    const created = JSON.parse(createRes!.body as string);
    expect(created.version).toBe(1);

    const updateRes = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/fixture-notes/${NOTE_ID}`,
        { title: 'B' },
        { 'if-match': '"1"' },
      ),
      'PUT',
      `/api/notebook/fixture-notes/${NOTE_ID}`,
      { enforceAuth: true },
    );
    expect(updateRes?.statusCode).toBe(200);

    const deleteRes = await dispatchRoutes(
      routes,
      adminEvent(
        'DELETE',
        `/api/notebook/fixture-notes/${NOTE_ID}`,
        {},
        { 'if-match': '"2"' },
      ),
      'DELETE',
      `/api/notebook/fixture-notes/${NOTE_ID}`,
      { enforceAuth: true },
    );
    expect(deleteRes?.statusCode).toBe(200);

    const feedRes = await dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/sync/changes'),
      'GET',
      '/api/notebook/sync/changes',
      { enforceAuth: true },
    );
    expect(feedRes?.statusCode).toBe(200);
    const feed = JSON.parse(feedRes!.body as string);
    expect(feed.changes).toHaveLength(3);
    expect(
      feed.changes.map((c: { version: number; deleted: boolean }) => ({
        version: c.version,
        deleted: c.deleted,
      })),
    ).toEqual([
      { version: 1, deleted: false },
      { version: 2, deleted: false },
      { version: 3, deleted: true },
    ]);
    expect(
      feed.changes.filter((c: { deleted: boolean }) => !c.deleted),
    ).toHaveLength(2);
    expect(
      feed.changes
        .filter((c: { deleted: boolean }) => !c.deleted)
        .every((c: { entity?: unknown }) => c.entity != null),
    ).toBe(true);
    expect(feed.changes[2].entity).toBeUndefined();
  });

  it('retried create with same ULID does not duplicate sync rows', async () => {
    const { doc, store } = createMemoryDoc();
    const repo = new FixtureNotesRepository(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );
    const ledger = new SyncLedger(doc, TABLE);
    const routes = [
      ...createFixtureNoteRoutes(repo),
      ...createSyncRoutes(ledger),
    ];

    for (let i = 0; i < 2; i += 1) {
      const res = await dispatchRoutes(
        routes,
        adminEvent('POST', '/api/notebook/fixture-notes', {
          id: NOTE_ID,
          title: 'Retry',
        }),
        'POST',
        '/api/notebook/fixture-notes',
        { enforceAuth: true },
      );
      expect(res?.statusCode).toBe(201);
    }

    const syncRows = [...store.values()].filter(
      (item) => item.entityType === 'syncChange',
    );
    expect(syncRows).toHaveLength(1);

    const feedRes = await dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/sync/changes'),
      'GET',
      '/api/notebook/sync/changes',
      { enforceAuth: true },
    );
    const feed = JSON.parse(feedRes!.body as string);
    expect(feed.changes).toHaveLength(1);
  });

  it('returns 412 when If-Match version mismatches', async () => {
    const { doc } = createMemoryDoc();
    const repo = new FixtureNotesRepository(
      doc,
      TABLE,
      () => '2026-09-28T10:00:00.000Z',
    );
    const routes = createFixtureNoteRoutes(repo);

    await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/fixture-notes', { id: NOTE_ID }),
      'POST',
      '/api/notebook/fixture-notes',
      { enforceAuth: true },
    );

    const res = await dispatchRoutes(
      routes,
      adminEvent(
        'PUT',
        `/api/notebook/fixture-notes/${NOTE_ID}`,
        { title: 'X' },
        { 'if-match': '"99"' },
      ),
      'PUT',
      `/api/notebook/fixture-notes/${NOTE_ID}`,
      { enforceAuth: true },
    );
    expect(res?.statusCode).toBe(412);
    expect(JSON.parse(res!.body as string).error).toBe('precondition_failed');
  });

  it('uses TransactWrite for create', async () => {
    const { doc } = createMemoryDoc();
    const repo = new FixtureNotesRepository(doc, TABLE);
    await repo.createIdempotent(USER, { id: NOTE_ID, title: '', body: '' });
    const send = doc.send as ReturnType<typeof vi.fn>;
    expect(send.mock.calls[0]![0]).toBeInstanceOf(TransactWriteCommand);
  });
});
