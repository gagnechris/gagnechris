import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { buildDailyNoteClaimItem, keys } from '@gagnechris/data';
import { SyncLedger } from '../../src/sync/ledger.js';
import { registerProductionSyncAdapters } from '../../src/sync/adapters.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { NotFoundError } from '../../src/data/errors.js';
import { createNoteRoutes } from '../../src/notes/handlers.js';
import { NotesRepository } from '../../src/notes/repository.js';
import { dispatchRoutes } from '../../src/router.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';
import { makeEvent } from '../support/make-event.js';

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

  it('stores taskIds derived from the body and derives them for older rows', async () => {
    const repo = new NotesRepository(doc, tableName);
    const TASK = '01ARZ3NDEKTSV4RRFFQ69G5T01';
    await repo.createFromRequest(USER_A, {
      id: PAGE_A,
      area: 'work',
      type: 'page',
      title: 'Embeds',
      bodyMarkdown: `intro\n{{task:${TASK}}}`,
      tags: [],
      pinned: false,
    });
    const key = keys.notebook.note.meta(USER_A, PAGE_A);
    const stored = await doc.send(
      new GetCommand({ TableName: tableName, Key: key }),
    );
    expect(stored.Item?.taskIds).toEqual([TASK]);

    const updated = await repo.updateFromRequest(USER_A, PAGE_A, 1, {
      bodyMarkdown: 'no embeds',
    });
    expect(updated.taskIds).toEqual([]);

    const { taskIds: _drop, ...legacy } = stored.Item!;
    await doc.send(new PutCommand({ TableName: tableName, Item: legacy }));
    expect((await repo.get(USER_A, PAGE_A))?.taskIds).toEqual([TASK]);
  });

  it('isolates owners, enforces daily claim, and feeds typed note changes', async () => {
    const repo = new NotesRepository(
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

    await repo.updateFromRequest(USER_A, PAGE_A, 1, { title: 'Edited' });

    const feed = await ledger.queryChangesSince(USER_A, {});
    expect(feed.changes.some((c) => c.type === 'note')).toBe(true);
    expect(feed.changes.map((c) => c.id).sort()).toEqual(
      [PAGE_A, dailyA.id].sort(),
    );
  });

  it('delete frees the daily slot; 10 concurrent creates give 1 winner and 9 daily_taken', async () => {
    const repo = new NotesRepository(
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

  it('delete releases the claim row; an orphaned claim gives the day to exactly one of 10 racers', async () => {
    const repo = new NotesRepository(
      doc,
      tableName,
      () => '2026-10-02T10:00:00.000Z',
    );
    const DAY = '2026-10-07';
    const claimKey = keys.notebook.dailyClaim(USER_A, 'work', DAY);
    const readClaim = async () =>
      (
        await doc.send(
          new GetCommand({
            TableName: tableName,
            Key: claimKey,
            ConsistentRead: true,
          }),
        )
      ).Item;
    const daily = (id: string) =>
      repo.createFromRequest(USER_A, {
        id,
        area: 'work',
        type: 'daily',
        date: DAY,
        title: id,
        bodyMarkdown: '',
        tags: [],
        pinned: false,
      });

    const first = await daily(DAILY_1);
    expect(await readClaim()).toMatchObject({ noteId: DAILY_1 });
    await repo.deleteIfVersion(USER_A, first.id, first.version);
    expect(await readClaim()).toBeUndefined();

    // A claim left behind whose tombstone has since been purged.
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: buildDailyNoteClaimItem(USER_A, 'work', DAY, DAILY_1),
      }),
    );
    await doc.send(
      new DeleteCommand({
        TableName: tableName,
        Key: keys.notebook.note.meta(USER_A, DAILY_1),
      }),
    );

    const ids = Array.from(
      { length: 10 },
      (_, i) => `01ARZ3NDEKTSV4RRFFQ69G5FE${i}`,
    );
    const results = await Promise.allSettled(ids.map((id) => daily(id)));
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
    expect(await readClaim()).toMatchObject({ noteId: winnerId });
  });

  it('10 parallel versionless daily PUTs give exactly one 200 and nine daily_taken with the winner', async () => {
    const routes = createNoteRoutes(new NotesRepository(doc, tableName));
    const put = async (path: string, id: string) => {
      const res = await dispatchRoutes(
        routes,
        makeEvent('PUT', path, {
          body: { id, title: id, bodyMarkdown: `body ${id}` },
          jwtClaims: { sub: USER_A },
        }),
        'PUT',
        path,
      );
      return {
        status: res.statusCode,
        body: JSON.parse(res.body as string) as Record<string, unknown>,
      };
    };

    for (let run = 0; run < 50; run += 1) {
      const day = new Date(Date.UTC(2027, 0, 1 + run))
        .toISOString()
        .slice(0, 10);
      const path = `/api/notebook/notes/daily/work/${day}`;
      const ids = Array.from(
        { length: 10 },
        (_, i) => `01ARZ3NDEKTSV4RRFF${String(run).padStart(2, '0')}${i}00000`,
      );
      const results = await Promise.all(ids.map((id) => put(path, id)));

      const won = results.filter((r) => r.status === 200);
      const lost = results.filter((r) => r.status === 409);
      expect(won, `run ${run}`).toHaveLength(1);
      expect(lost, `run ${run}`).toHaveLength(9);
      const winner = won[0]!.body;
      expect(winner).toMatchObject({
        version: 1,
        bodyMarkdown: `body ${winner.id}`,
      });
      for (const r of lost) {
        expect(r.body).toMatchObject({
          error: 'daily_taken',
          current: { id: winner.id, version: 1, title: winner.id },
        });
      }
    }
  });

  it("getMany reads live notes in request order, leaving out deleted, unknown and other users' ids", async () => {
    const repo = new NotesRepository(doc, tableName);
    const page = (id: string, title: string) => ({
      id,
      area: 'work' as const,
      type: 'page' as const,
      title,
      bodyMarkdown: '',
      tags: [],
      pinned: false,
    });
    await repo.createFromRequest(USER_A, page(PAGE_A, 'Mine'));
    await repo.createFromRequest(USER_A, page(DAILY_1, 'Gone'));
    await repo.createFromRequest(USER_B, page(DAILY_2, 'Theirs'));
    await repo.deleteIfVersion(USER_A, DAILY_1, 1);

    const got = await repo.getMany(USER_A, [
      DAILY_2,
      '01ARZ3NDEKTSV4RRFFQ69G5FC9',
      DAILY_1,
      PAGE_A,
    ]);
    expect(got.map((n) => n.title)).toEqual(['Mine']);
  });
});
