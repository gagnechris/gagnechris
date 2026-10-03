import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SyncLedger } from '../../src/sync/ledger.js';
import { registerProductionSyncAdapters } from '../../src/sync/adapters.js';
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

describe('notes repository (DynamoDB Local)', () => {
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
    registerProductionSyncAdapters();
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
    await expect(
      repo.createFromRequest(USER_A, {
        id: DAILY_2,
        area: 'work',
        type: 'daily',
        date: '2026-10-02',
        title: 'Second',
        bodyMarkdown: '',
        tags: [],
        pinned: false,
      }),
    ).rejects.toMatchObject({
      code: 'daily_taken',
      current: { id: dailyA.id, title: 'First' },
    });

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

  it('delete frees the daily slot; 10 concurrent creates give 1 winner and 9 daily_taken', async () => {
    const repo = createNotesRepository(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );
    const daily = (id: string, title: string) =>
      repo.createFromRequest(USER_A, {
        id,
        area: 'work',
        type: 'daily',
        date: '2026-10-05',
        title,
        bodyMarkdown: '',
        tags: [],
        pinned: false,
      });

    const first = await daily(DAILY_1, 'First');
    await repo.deleteIfVersion(USER_A, first.id, first.version);
    const empty = await repo.getDaily(USER_A, 'work', '2026-10-05');
    expect(empty).toMatchObject({ exists: false });

    const recreated = await daily(DAILY_2, 'Recreated');
    expect(recreated.id).toBe(DAILY_2);
    expect(await repo.getDaily(USER_A, 'work', '2026-10-05')).toMatchObject({
      id: DAILY_2,
    });

    await expect(
      repo.updateFromRequest(USER_A, DAILY_2, 1, { area: 'personal' }),
    ).rejects.toMatchObject({ name: 'BadRequestError' });

    const ids = Array.from(
      { length: 10 },
      (_, i) => `01ARZ3NDEKTSV4RRFFQ69G5FD${i}`,
    );
    const results = await Promise.allSettled(
      ids.map((id) =>
        repo.createFromRequest(USER_A, {
          id,
          area: 'personal',
          type: 'daily',
          date: '2026-10-06',
          title: id,
          bodyMarkdown: '',
          tags: [],
          pinned: false,
        }),
      ),
    );
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);
    const winnerId = (won[0] as PromiseFulfilledResult<{ id: string }>).value
      .id;
    for (const r of lost) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({
        code: 'daily_taken',
        current: { id: winnerId },
      });
    }
  });
});
