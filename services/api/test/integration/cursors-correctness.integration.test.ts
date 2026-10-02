/**
 * DynamoDB Local: foreign / wrong-since cursors → 400 (CHR-170).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encodeCursor } from '../../src/data/cursor.js';
import { SyncLedger } from '../../src/sync/ledger.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
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

const USER_A = 'user-cursor-a';
const USER_B = 'user-cursor-b';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOTE_ID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FB0';

describe('cursor correctness (DynamoDB Local, CHR-170)', () => {
  let tableName: string;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('cursors-correctness');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
    clearSyncEntities();
    registerFakeNoteSync();
  });

  it('rejects other-user and changed-since sync cursors with SyntaxError (400)', async () => {
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

    await repo.createIdempotent(
      buildFakeNote(
        USER_A,
        NOTE_ID,
        { title: 'a1' },
        '2026-10-02T10:00:00.000Z',
      ),
    );
    await repo.createIdempotent(
      buildFakeNote(
        USER_A,
        NOTE_ID_2,
        { title: 'a2' },
        '2026-10-02T10:30:00.000Z',
      ),
    );

    const page1 = await ledger.queryChangesSince(USER_A, { limit: 1 });
    expect(page1.nextCursor).toBeTruthy();

    await expect(
      ledger.queryChangesSince(USER_B, { cursor: page1.nextCursor, limit: 1 }),
    ).rejects.toBeInstanceOf(SyntaxError);

    // Reusing a cursor under a tighter `since` that excludes the LEK sort key.
    await expect(
      ledger.queryChangesSince(USER_A, {
        since: '2026-10-02T10:45:00.000Z',
        cursor: page1.nextCursor,
        limit: 1,
      }),
    ).rejects.toBeInstanceOf(SyntaxError);

    // Explicit foreign ExclusiveStartKey partition.
    const foreign = encodeCursor({
      pk: `USER#${USER_A}#NOTE#${NOTE_ID}`,
      sk: 'META',
      syncPk: `SYNC#${USER_B}`,
      syncSk: '2026-10-02T10:00:00.000Z#FAKENOTE#' + NOTE_ID,
    });
    await expect(
      ledger.queryChangesSince(USER_A, { cursor: foreign, limit: 1 }),
    ).rejects.toBeInstanceOf(SyntaxError);
  });
});
