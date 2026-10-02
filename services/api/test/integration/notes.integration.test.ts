/**
 * DynamoDB Local acceptance tests for Notes API (CHR-40).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SyncLedger } from '../../src/sync/ledger.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { NotFoundError } from '../../src/data/errors.js';
import { createNotesRepository } from '../../src/notes/repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

const USER_A = 'user-a-notes';
const USER_B = 'user-b-notes';
const PAGE_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DAILY_1 = '01ARZ3NDEKTSV4RRFFQ69G5FC0';
const DAILY_2 = '01ARZ3NDEKTSV4RRFFQ69G5FC1';

describe('notes repository (DynamoDB Local, CHR-40)', () => {
  let tableName: string;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('notes-api');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
    clearSyncEntities();
  });

  it('isolates owners, enforces daily claim, and feeds typed note changes', async () => {
    const repo = createNotesRepository(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );
    const ledger = new SyncLedger(
      doc,
      tableName,
      () => '2026-10-02T12:00:00.000Z',
    );

    const page = await repo.createFromRequest(USER_A, {
      id: PAGE_A,
      area: 'work',
      type: 'page',
      title: 'A page',
      bodyMarkdown: 'body',
      tags: ['x'],
      pinned: false,
    });
    expect(page.version).toBe(1);

    await expect(repo.getOrThrow(USER_B, PAGE_A)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const dailyA = await repo.createFromRequest(USER_A, {
      id: DAILY_1,
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: 'First',
      bodyMarkdown: '',
      tags: [],
      pinned: false,
    });
    const dailyRace = await repo.createFromRequest(USER_A, {
      id: DAILY_2,
      area: 'work',
      type: 'daily',
      date: '2026-10-02',
      title: 'Second',
      bodyMarkdown: '',
      tags: [],
      pinned: false,
    });
    expect(dailyRace.id).toBe(dailyA.id);
    expect(dailyRace.title).toBe('First');

    const listed = await repo.list(USER_A, {
      area: 'work',
      from: '2026-10-01',
      to: '2026-10-03',
    });
    expect(listed.items.map((n) => n.id)).toContain(dailyA.id);
    expect(listed.items.every((n) => n.type === 'daily')).toBe(true);

    await repo.updateIfVersion(USER_A, PAGE_A, 1, {
      ...page,
      title: 'Edited',
      version: 2,
      updatedAt: '2026-10-02T11:00:00.000Z',
    });

    const feed = await ledger.queryChangesSince(USER_A, {});
    expect(feed.changes.some((c) => c.type === 'note')).toBe(true);
    expect(feed.changes.map((c) => c.id).sort()).toEqual(
      [PAGE_A, dailyA.id].sort(),
    );
  });
});
