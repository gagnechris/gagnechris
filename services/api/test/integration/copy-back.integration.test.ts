/**
 * "Restore my notes" copy-back rehearsal on DynamoDB Local (CHR-198).
 *
 * Seeds a live table through the real repositories, snapshots it into a
 * scratch "restore" table, damages the live table (deletes, edits, a purged
 * row, a re-taken day), then plans and applies a copy-back and checks the
 * result through the same repositories and sync feed clients use.
 */
import { DeleteCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createNotesRepository } from '../../src/notes/repository.js';
import {
  applyCopyBack,
  formatCopyBackPlan,
  planCopyBack,
  type CopyBackEntry,
  type CopyBackOptions,
} from '../../src/restore/copy-back.js';
import { SyncLedger } from '../../src/sync/ledger.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { createTasksRepository } from '../../src/tasks/repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';

const OWNER = 'owner-sub-copyback';
const OTHER = 'other-sub-copyback';
const PAGE_A = '01ARZ3NDEKTSV4RRFFQ69G5CA1'; // deleted after restore → undelete
const DAILY_B = '01ARZ3NDEKTSV4RRFFQ69G5CB1'; // edited after → target newer
const PAGE_C = '01ARZ3NDEKTSV4RRFFQ69G5CC1'; // unchanged → identical
const DAILY_D = '01ARZ3NDEKTSV4RRFFQ69G5CD1'; // deleted, day re-taken → taken
const DAILY_E = '01ARZ3NDEKTSV4RRFFQ69G5CE1'; // the note that took D's day
const PAGE_F = '01ARZ3NDEKTSV4RRFFQ69G5CF1'; // META purged → create
const DAILY_G = '01ARZ3NDEKTSV4RRFFQ69G5CG1'; // deleted daily → undelete + claim
const TASK_T = '01ARZ3NDEKTSV4RRFFQ69G5CT1'; // linked to A, deleted → undelete
const OTHER_N = '01ARZ3NDEKTSV4RRFFQ69G5CO1'; // another owner: never touched

describe('restore copy-back (DynamoDB Local, CHR-198)', () => {
  const doc = createLocalDocClient();
  let live: string;
  let scratch: string;
  let clock = '2026-10-01T10:00:00.000Z';
  const now = () => clock;

  beforeAll(async () => {
    live = await createEphemeralIntegrationTable('copyback-live');
    scratch = await createEphemeralIntegrationTable('copyback-scratch');
  });

  afterAll(async () => {
    await deleteIntegrationTable(live);
    await deleteIntegrationTable(scratch);
  });

  beforeEach(async () => {
    await truncateTable(doc, live);
    await truncateTable(doc, scratch);
    clearSyncEntities();
    clock = '2026-10-01T10:00:00.000Z';
  });

  const opts = (over: Partial<CopyBackOptions> = {}): CopyBackOptions => ({
    sourceTable: scratch,
    targetTable: live,
    userId: OWNER,
    allowedTargets: [live],
    now,
    ...over,
  });

  async function snapshotLiveIntoScratch(): Promise<void> {
    const page = await doc.send(new ScanCommand({ TableName: live }));
    for (const item of page.Items ?? []) {
      await doc.send(new PutCommand({ TableName: scratch, Item: item }));
    }
  }

  async function seedAndDamage() {
    const notes = createNotesRepository(doc, live, now);
    const tasks = createTasksRepository(doc, live, now);
    const page = (id: string, title: string, userId = OWNER) =>
      notes.createFromRequest(userId, {
        id,
        area: 'work',
        type: 'page',
        title,
        bodyMarkdown: `${title} body`,
        tags: [],
        pinned: false,
      });
    const daily = (id: string, date: string, body: string) =>
      notes.createFromRequest(OWNER, {
        id,
        area: 'personal',
        type: 'daily',
        date,
        title: '',
        bodyMarkdown: body,
        tags: [],
        pinned: false,
      });

    await page(PAGE_A, 'Alpha');
    await daily(DAILY_B, '2026-09-30', 'original B');
    await page(PAGE_C, 'Charlie');
    await daily(DAILY_D, '2026-09-29', 'original D');
    await page(PAGE_F, 'Foxtrot');
    await daily(DAILY_G, '2026-09-28', 'original G');
    await page(OTHER_N, 'Not mine', OTHER);
    await tasks.createFromRequest(OWNER, {
      id: TASK_T,
      area: 'work',
      title: 'Task on Alpha',
      description: '',
      priority: 'high',
      status: 'todo',
      dueDate: null,
      noteId: PAGE_A,
      tags: [],
    });

    // Restore point.
    await snapshotLiveIntoScratch();

    // Damage after the restore point.
    clock = '2026-10-02T09:00:00.000Z';
    await tasks.deleteIfVersion(OWNER, TASK_T, 'any');
    await notes.deleteIfVersion(OWNER, PAGE_A, 'any');
    await notes.updateFromRequest(OWNER, DAILY_B, 'any', {
      bodyMarkdown: 'overwritten B',
    });
    await notes.deleteIfVersion(OWNER, DAILY_D, 'any');
    await daily(DAILY_E, '2026-09-29', 'new owner of D day');
    await notes.deleteIfVersion(OWNER, DAILY_G, 'any');
    await notes.deleteIfVersion(OTHER, OTHER_N, 'any');
    // A tombstone purged by TTL leaves no META row at all.
    await doc.send(
      new DeleteCommand({
        TableName: live,
        Key: keys.notebook.note.meta(OWNER, PAGE_F),
      }),
    );
    return { notes, tasks };
  }

  const actions = (plan: CopyBackEntry[]) =>
    Object.fromEntries(plan.map((e) => [e.id, e.action]));

  it('plans a dry run without writing', async () => {
    await seedAndDamage();
    const before = await doc.send(new ScanCommand({ TableName: live }));
    const plan = await planCopyBack(doc, opts());
    expect(actions(plan)).toEqual({
      [PAGE_A]: 'undelete',
      [DAILY_B]: 'skip-target-newer',
      [PAGE_C]: 'skip-identical',
      [DAILY_D]: 'skip-daily-taken',
      [PAGE_F]: 'create',
      [DAILY_G]: 'undelete',
      [TASK_T]: 'undelete',
    });
    expect(plan.find((e) => e.id === PAGE_A)?.newVersion).toBe(3);
    expect(plan.find((e) => e.id === PAGE_F)?.newVersion).toBe(2);
    const lines = formatCopyBackPlan(plan).join('\n');
    expect(lines).not.toContain('Alpha'); // titles hidden by default
    expect(formatCopyBackPlan(plan, { showTitles: true }).join('\n')).toContain(
      'Alpha',
    );
    const after = await doc.send(new ScanCommand({ TableName: live }));
    expect(after.Items).toEqual(before.Items);
  });

  it('applies: restored rows are live, versioned past the tombstone, and in the sync feed', async () => {
    const { notes, tasks } = await seedAndDamage();
    const plan = await planCopyBack(doc, opts());
    clock = '2026-10-03T08:00:00.000Z';
    const results = await applyCopyBack(doc, opts(), plan);
    expect(results.map((r) => [r.id, r.outcome]).sort()).toEqual(
      [
        [PAGE_A, 'written'],
        [PAGE_F, 'written'],
        [DAILY_G, 'written'],
        [TASK_T, 'written'],
      ].sort(),
    );

    const a = await notes.get(OWNER, PAGE_A);
    expect(a).toMatchObject({
      title: 'Alpha',
      version: 3,
      deleted: false,
      updatedAt: clock,
    });
    expect(await notes.get(OWNER, PAGE_F)).toMatchObject({
      title: 'Foxtrot',
      version: 2,
    });
    expect(await tasks.get(OWNER, TASK_T)).toMatchObject({
      noteId: PAGE_A,
      version: 3,
    });
    // Daily claim re-taken: the day resolves to the restored note again.
    expect(await notes.getDaily(OWNER, 'personal', '2026-09-28')).toMatchObject(
      { id: DAILY_G, bodyMarkdown: 'original G' },
    );
    // D's day still belongs to E; B keeps its newer content.
    expect(await notes.getDaily(OWNER, 'personal', '2026-09-29')).toMatchObject(
      { id: DAILY_E },
    );
    expect(await notes.get(OWNER, DAILY_B)).toMatchObject({
      bodyMarkdown: 'overwritten B',
    });
    // Lists see restored rows (GSI1 keys rebuilt).
    const list = await notes.list(OWNER, { area: 'work' });
    expect(list.items.map((n) => n.id)).toEqual(
      expect.arrayContaining([PAGE_A, PAGE_F]),
    );
    // Other owner untouched.
    expect(await notes.get(OTHER, OTHER_N)).toBeUndefined();

    // Clients polling since before the copy-back see the restored versions.
    const ledger = new SyncLedger(doc, live, () => '2026-10-03T08:00:05.000Z');
    const feed = await ledger.queryChangesSince(OWNER, {
      since: '2026-10-03T07:59:00.000Z',
    });
    expect(
      feed.changes.map((c) => [c.id, c.version, c.deleted]).sort(),
    ).toEqual(
      [
        [PAGE_A, 3, false],
        [PAGE_F, 2, false],
        [DAILY_G, 3, false],
        [TASK_T, 3, false],
      ].sort(),
    );

    // Re-planning after apply finds nothing left to do.
    const again = await planCopyBack(doc, opts());
    expect(
      again.filter((e) =>
        ['create', 'undelete', 'overwrite'].includes(e.action),
      ),
    ).toEqual([]);
  });

  it('overwrites a newer live row only with overwriteNewer, and keeps createHash', async () => {
    const { notes } = await seedAndDamage();
    const plan = await planCopyBack(
      doc,
      opts({ ids: [DAILY_B], overwriteNewer: true }),
    );
    expect(actions(plan)).toEqual({ [DAILY_B]: 'overwrite' });
    await applyCopyBack(doc, opts(), plan);
    expect(await notes.get(OWNER, DAILY_B)).toMatchObject({
      bodyMarkdown: 'original B',
      version: 3,
    });
    const raw = await doc.send(
      new ScanCommand({
        TableName: live,
        FilterExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': keys.notebook.note.meta(OWNER, DAILY_B).pk,
        },
      }),
    );
    expect(String(raw.Items?.[0]?.createHash)).toMatch(/^sha256:/);
  });

  it('warns when a task is restored without its deleted note', async () => {
    await seedAndDamage();
    const plan = await planCopyBack(doc, opts({ types: ['task'] }));
    expect(plan).toHaveLength(1);
    expect(plan[0]?.warnings[0]).toContain(PAGE_A);
  });

  it('reports a conflict instead of clobbering an edit made after the plan', async () => {
    const { notes } = await seedAndDamage();
    const plan = await planCopyBack(
      doc,
      opts({ ids: [DAILY_B], overwriteNewer: true }),
    );
    await notes.updateFromRequest(OWNER, DAILY_B, 'any', {
      bodyMarkdown: 'edited during the copy-back',
    });
    const results = await applyCopyBack(doc, opts(), plan);
    expect(results).toEqual([
      expect.objectContaining({ id: DAILY_B, outcome: 'conflict' }),
    ]);
    expect(await notes.get(OWNER, DAILY_B)).toMatchObject({
      bodyMarkdown: 'edited during the copy-back',
    });
  });

  it('lists ids that are not in the source', async () => {
    await seedAndDamage();
    const plan = await planCopyBack(
      doc,
      opts({ ids: ['01ARZ3NDEKTSV4RRFFQ69G5CZZ'] }),
    );
    expect(plan.map((e) => e.action)).toEqual(['skip-not-in-source']);
  });
});
