// The forged cursor needs the server's cursor encoding to build, so this
// case stays in-process; test/http/cursors-correctness.test.ts covers the rest.
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
import { InvalidCursorError } from '../../src/data/errors.js';

const USER_A = 'user-cursor-a';
const USER_B = 'user-cursor-b';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('cursor correctness (DynamoDB Local)', () => {
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

  it('rejects a sync cursor whose keys point at another user (400)', async () => {
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

    const foreign = encodeCursor({
      pk: `USER#${USER_A}#NOTE#${NOTE_ID}`,
      sk: 'META',
      syncPk: `SYNC#${USER_B}`,
      syncSk: '2026-10-02T10:00:00.000Z#FAKENOTE#' + NOTE_ID,
    });
    await expect(
      ledger.queryChangesSince(USER_A, { cursor: foreign, limit: 1 }),
    ).rejects.toBeInstanceOf(InvalidCursorError);
  });
});
