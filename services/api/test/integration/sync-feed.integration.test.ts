import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SyncLedger } from '../../src/sync/ledger.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import {
  buildFakeNote,
  createFakeNotesRepo,
  FAKE_NOTE_CHANGE_TYPE,
  registerFakeNoteSync,
} from '../support/fake-note.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

const USER = 'user-sync-it';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOTE_ID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FB0';

describe('sync feed (DynamoDB Local, CHR-162)', () => {
  let tableName: string;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('sync-feed');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
    clearSyncEntities();
    registerFakeNoteSync();
  });

  it('returns changes via sparse GSI3 with watermark + tombstone', async () => {
    const repo = createFakeNotesRepo(
      doc,
      tableName,
      () => '2026-09-28T10:00:00.000Z',
    );
    const ledger = new SyncLedger(
      doc,
      tableName,
      () => '2026-09-28T12:00:00.000Z',
    );

    const created = await repo.createIdempotent(
      buildFakeNote(
        USER,
        NOTE_ID,
        { title: 'local-a' },
        '2026-09-28T10:00:00.000Z',
      ),
    );
    await repo.createIdempotent(
      buildFakeNote(
        USER,
        NOTE_ID_2,
        { title: 'local-b' },
        '2026-09-28T10:30:00.000Z',
      ),
    );
    await repo.softDelete(USER, NOTE_ID, 1, {
      ...created,
      version: 2,
      updatedAt: '2026-09-28T11:00:00.000Z',
      deleted: true,
    });

    const feed = await ledger.queryChangesSince(USER, {});
    expect(feed.changes).toHaveLength(2);
    expect(feed.nextSince).toBe('2026-09-28T12:00:00.000Z');

    const byId = Object.fromEntries(feed.changes.map((c) => [c.id, c]));
    expect(byId[NOTE_ID]).toMatchObject({
      type: FAKE_NOTE_CHANGE_TYPE,
      version: 2,
      deleted: true,
    });
    expect(byId[NOTE_ID]!.entity).toBeUndefined();
    expect(byId[NOTE_ID_2]).toMatchObject({
      type: FAKE_NOTE_CHANGE_TYPE,
      deleted: false,
      version: 1,
    });
    expect(byId[NOTE_ID_2]!.entity).toMatchObject({ title: 'local-b' });
  });
});
