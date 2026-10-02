/**
 * DynamoDB Local acceptance tests for owner-scoped repository (CHR-169).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GSI1_NAME,
  GSI2_NAME,
  keys,
  notebookAreaGsi1Pk,
  noteTasksGsi2Pk,
} from '@gagnechris/data';
import { SyncLedger } from '../../src/sync/ledger.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { NotFoundError } from '../../src/data/errors.js';
import {
  decodeCursor,
  GSI1_CURSOR_KEYS,
  GSI2_CURSOR_KEYS,
} from '../../src/data/cursor.js';
import {
  buildFakeNote,
  createFakeNotesRepo,
  registerFakeNoteSync,
} from '../support/fake-note.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

const USER_A = 'user-a-owner';
const USER_B = 'user-b-other';
const NOTE_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOTE_A2 = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
const NOTE_B = '01ARZ3NDEKTSV4RRFFQ69G5FB1';
const DAILY_ULID_1 = '01ARZ3NDEKTSV4RRFFQ69G5FC0';
const DAILY_ULID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FC1';

describe('owner-scoped repository (DynamoDB Local, CHR-169)', () => {
  let tableName: string;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('owner-scoped');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
    clearSyncEntities();
    registerFakeNoteSync();
  });

  it('user B gets 404 on GET/PUT/DELETE of user A; lists and feed stay isolated', async () => {
    const repo = createFakeNotesRepo(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );
    const ledger = new SyncLedger(
      doc,
      tableName,
      () => '2026-10-02T12:00:00.000Z',
    );

    const aNote = await repo.createIdempotent(
      buildFakeNote(
        USER_A,
        NOTE_A,
        {
          title: 'A private',
          area: 'work',
          noteDate: '2026-10-02',
        },
        '2026-10-02T10:00:00.000Z',
      ),
    );
    await repo.createIdempotent(
      buildFakeNote(
        USER_B,
        NOTE_B,
        {
          title: 'B private',
          area: 'work',
          noteDate: '2026-10-02',
        },
        '2026-10-02T10:30:00.000Z',
      ),
    );

    expect(await repo.get(USER_B, NOTE_A)).toBeUndefined();
    await expect(repo.getOrThrow(USER_B, NOTE_A)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      repo.updateIfVersion(USER_B, NOTE_A, 1, {
        ...aNote,
        userId: USER_B,
        title: 'hijack',
        version: 2,
        updatedAt: '2026-10-02T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      repo.softDelete(USER_B, NOTE_A, 1, {
        ...aNote,
        userId: USER_B,
        version: 2,
        updatedAt: '2026-10-02T11:00:00.000Z',
        deleted: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // Cross-user get by A's id under B's key space is a miss (different pk).
    expect(await repo.get(USER_A, NOTE_B)).toBeUndefined();

    const aList = await repo.queryPage({
      IndexName: GSI1_NAME,
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: {
        ':pk': notebookAreaGsi1Pk(USER_A, 'work'),
      },
    });
    expect(aList.items.map((n) => n.id)).toEqual([NOTE_A]);
    expect(aList.items.every((n) => n.userId === USER_A)).toBe(true);

    const feedA = await ledger.queryChangesSince(USER_A, {});
    expect(feedA.changes.map((c) => c.id)).toEqual([NOTE_A]);
    const feedB = await ledger.queryChangesSince(USER_B, {});
    expect(feedB.changes.map((c) => c.id)).toEqual([NOTE_B]);
  });

  it('two daily-note creates (same area/date, different ULIDs) keep one winner', async () => {
    const repo = createFakeNotesRepo(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );

    const first = await repo.createIdempotent(
      buildFakeNote(
        USER_A,
        DAILY_ULID_1,
        {
          title: 'device-1',
          area: 'personal',
          noteDate: '2026-10-02',
        },
        '2026-10-02T10:00:00.000Z',
      ),
    );
    // Semantics: first writer wins; loser returns the existing daily note.
    const second = await repo.createIdempotent(
      buildFakeNote(
        USER_A,
        DAILY_ULID_2,
        {
          title: 'device-2',
          area: 'personal',
          noteDate: '2026-10-02',
        },
        '2026-10-02T10:00:01.000Z',
      ),
    );

    expect(second.id).toBe(first.id);
    expect(second.title).toBe('device-1');
    expect(await repo.get(USER_A, DAILY_ULID_2)).toBeUndefined();
    expect(await repo.get(USER_A, DAILY_ULID_1)).toMatchObject({
      title: 'device-1',
      area: 'personal',
      noteDate: '2026-10-02',
    });
    expect(keys.notebook.dailyClaim(USER_A, 'personal', '2026-10-02')).toEqual({
      pk: `USER#${USER_A}#DAILY#personal#2026-10-02`,
      sk: 'NOTE',
    });
  });

  it('queries GSI1 and GSI2 with valid per-index cursors', async () => {
    const repo = createFakeNotesRepo(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );

    await repo.createIdempotent(
      buildFakeNote(
        USER_A,
        NOTE_A,
        {
          title: 'n1',
          area: 'work',
          noteDate: '2026-10-01',
        },
        '2026-10-02T10:00:00.000Z',
      ),
    );
    await repo.createIdempotent(
      buildFakeNote(
        USER_A,
        NOTE_A2,
        {
          title: 'n2',
          area: 'work',
          noteDate: '2026-10-02',
        },
        '2026-10-02T10:30:00.000Z',
      ),
    );

    const gsi1Page1 = await repo.queryPage({
      IndexName: GSI1_NAME,
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: {
        ':pk': notebookAreaGsi1Pk(USER_A, 'work'),
      },
      limit: 1,
    });
    expect(gsi1Page1.items).toHaveLength(1);
    expect(gsi1Page1.nextCursor).toBeTruthy();
    expect(decodeCursor(gsi1Page1.nextCursor, GSI1_CURSOR_KEYS)).toMatchObject({
      gsi1pk: notebookAreaGsi1Pk(USER_A, 'work'),
    });

    const gsi1Page2 = await repo.queryPage({
      IndexName: GSI1_NAME,
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: {
        ':pk': notebookAreaGsi1Pk(USER_A, 'work'),
      },
      cursor: gsi1Page1.nextCursor,
      limit: 1,
    });
    expect(gsi1Page2.items).toHaveLength(1);
    expect(gsi1Page2.items[0]!.id).not.toBe(gsi1Page1.items[0]!.id);

    const gsi2Page = await repo.queryPage({
      IndexName: GSI2_NAME,
      KeyConditionExpression: 'gsi2pk = :pk',
      ExpressionAttributeValues: {
        ':pk': noteTasksGsi2Pk(USER_A, NOTE_A),
      },
      limit: 1,
    });
    expect(gsi2Page.items).toHaveLength(1);
    expect(gsi2Page.items[0]!.id).toBe(NOTE_A);
    if (gsi2Page.nextCursor) {
      expect(decodeCursor(gsi2Page.nextCursor, GSI2_CURSOR_KEYS)).toMatchObject(
        {
          gsi2pk: noteTasksGsi2Pk(USER_A, NOTE_A),
        },
      );
    }

    // Soft-delete drops list GSI keys so area lists no longer return the row.
    const live = gsi1Page1.items[0]!;
    await repo.softDelete(USER_A, live.id, live.version, {
      ...live,
      version: live.version + 1,
      updatedAt: '2026-10-02T11:00:00.000Z',
      deleted: true,
    });
    const afterDelete = await repo.queryPage({
      IndexName: GSI1_NAME,
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: {
        ':pk': notebookAreaGsi1Pk(USER_A, 'work'),
      },
    });
    expect(afterDelete.items.map((n) => n.id)).not.toContain(live.id);
  });
});
