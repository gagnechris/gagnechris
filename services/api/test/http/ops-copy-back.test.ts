import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import {
  applyCopyBack,
  formatCopyBackPlan,
  planCopyBack,
  type CopyBackEntry,
  type CopyBackOptions,
} from '@gagnechris/ops/copy-back';
import {
  createEphemeralIntegrationTable,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

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
const OTHER_N = '01ARZ3NDEKTSV4RRFFQ69G5CN1'; // another owner: never touched

// Bodies are whatever JSON the server sent; tests assert on their shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const h = useApi('copyback-live');

async function call(
  user: string,
  method: string,
  path: string,
  opts: { body?: unknown; query?: Record<string, string> } = {},
): Promise<{ status: number; body: Json }> {
  const res = await h.api.request(method, path, {
    ...opts,
    claims: notebookUser(user),
  });
  return { status: res.status, body: res.body };
}

async function ok(
  user: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Json> {
  const res = await call(user, method, path, { body });
  expect(
    res.status >= 200 && res.status < 300,
    `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBe(true);
  return res.body;
}

const page = (id: string, title: string, user = OWNER) =>
  ok(user, 'POST', '/api/notebook/notes', {
    id,
    area: 'work',
    type: 'page',
    title,
    bodyMarkdown: `${title} body`,
    tags: [],
    pinned: false,
  });

const daily = (id: string, date: string, body: string) =>
  ok(OWNER, 'POST', '/api/notebook/notes', {
    id,
    area: 'personal',
    type: 'daily',
    date,
    title: '',
    bodyMarkdown: body,
    tags: [],
    pinned: false,
  });

const deleteNote = (id: string, user = OWNER) =>
  ok(user, 'DELETE', `/api/notebook/notes/${id}`, { version: 1 });

describe('restore copy-back (DynamoDB Local)', () => {
  let scratch: string;
  // Later than every API write in the test, so the sync feed read from just
  // before it holds only the copy-back writes.
  let applyAt: string;

  beforeAll(async () => {
    scratch = await createEphemeralIntegrationTable('copyback-scratch');
  });

  afterAll(async () => {
    await deleteIntegrationTable(scratch);
  });

  beforeEach(async () => {
    await truncateTable(h.doc, scratch);
    applyAt = new Date(Date.now() + 60 * 60_000).toISOString();
  });

  const opts = (over: Partial<CopyBackOptions> = {}): CopyBackOptions => ({
    sourceTable: scratch,
    targetTable: h.tableName,
    userId: OWNER,
    allowedTargets: [h.tableName],
    now: () => applyAt,
    ...over,
  });

  async function snapshotLiveIntoScratch(): Promise<void> {
    const out = await h.doc.send(new ScanCommand({ TableName: h.tableName }));
    for (const item of out.Items ?? []) {
      await h.doc.send(new PutCommand({ TableName: scratch, Item: item }));
    }
  }

  async function seedAndDamage(): Promise<void> {
    await page(PAGE_A, 'Alpha');
    await daily(DAILY_B, '2026-09-30', 'original B');
    await page(PAGE_C, 'Charlie');
    await daily(DAILY_D, '2026-09-29', 'original D');
    await page(PAGE_F, 'Foxtrot');
    await daily(DAILY_G, '2026-09-28', 'original G');
    await page(OTHER_N, 'Not mine', OTHER);
    await ok(OWNER, 'POST', '/api/notebook/tasks', {
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

    await snapshotLiveIntoScratch();
    // "Newer" compares updatedAt at millisecond precision.
    await new Promise((r) => setTimeout(r, 5));

    await ok(OWNER, 'DELETE', `/api/notebook/tasks/${TASK_T}`, {
      version: 1,
    });
    await deleteNote(PAGE_A);
    await ok(OWNER, 'PUT', `/api/notebook/notes/${DAILY_B}`, {
      version: 1,
      bodyMarkdown: 'overwritten B',
    });
    await deleteNote(DAILY_D);
    await daily(DAILY_E, '2026-09-29', 'new owner of D day');
    await deleteNote(DAILY_G);
    await deleteNote(OTHER_N, OTHER);
    // A tombstone purged by TTL leaves no META row at all.
    await h.doc.send(
      new DeleteCommand({
        TableName: h.tableName,
        Key: keys.notebook.note.meta(OWNER, PAGE_F),
      }),
    );
  }

  const actions = (plan: CopyBackEntry[]) =>
    Object.fromEntries(plan.map((e) => [e.id, e.action]));

  it('plans a dry run without writing', async () => {
    await seedAndDamage();
    const before = await h.doc.send(
      new ScanCommand({ TableName: h.tableName }),
    );
    const plan = await planCopyBack(h.doc, opts());
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
    const after = await h.doc.send(new ScanCommand({ TableName: h.tableName }));
    expect(after.Items).toEqual(before.Items);
  });

  it('applies: the API serves restored rows live, versioned past the tombstone, and in the sync feed', async () => {
    await seedAndDamage();
    const plan = await planCopyBack(h.doc, opts());
    const results = await applyCopyBack(h.doc, opts(), plan);
    expect(results.map((r) => [r.id, r.outcome]).sort()).toEqual(
      [
        [PAGE_A, 'written'],
        [PAGE_F, 'written'],
        [DAILY_G, 'written'],
        [TASK_T, 'written'],
      ].sort(),
    );

    expect(
      await ok(OWNER, 'GET', `/api/notebook/notes/${PAGE_A}`),
    ).toMatchObject({
      title: 'Alpha',
      version: 3,
      deleted: false,
      updatedAt: applyAt,
    });
    expect(
      await ok(OWNER, 'GET', `/api/notebook/notes/${PAGE_F}`),
    ).toMatchObject({ title: 'Foxtrot', version: 2 });
    expect(
      await ok(OWNER, 'GET', `/api/notebook/tasks/${TASK_T}`),
    ).toMatchObject({ noteId: PAGE_A, version: 3 });
    // Daily claim re-taken: the day resolves to the restored note again.
    expect(
      await ok(OWNER, 'GET', '/api/notebook/notes/daily/personal/2026-09-28'),
    ).toMatchObject({ id: DAILY_G, bodyMarkdown: 'original G' });
    // D's day still belongs to E; B keeps its newer content.
    expect(
      await ok(OWNER, 'GET', '/api/notebook/notes/daily/personal/2026-09-29'),
    ).toMatchObject({ id: DAILY_E });
    expect(
      await ok(OWNER, 'GET', `/api/notebook/notes/${DAILY_B}`),
    ).toMatchObject({ bodyMarkdown: 'overwritten B' });
    const list = await call(OWNER, 'GET', '/api/notebook/notes', {
      query: { area: 'work' },
    });
    expect(list.status).toBe(200);
    expect((list.body.items as { id: string }[]).map((n) => n.id)).toEqual(
      expect.arrayContaining([PAGE_A, PAGE_F]),
    );
    expect(
      (await call(OTHER, 'GET', `/api/notebook/notes/${OTHER_N}`)).status,
    ).toBe(404);

    // Clients polling since before the copy-back see the restored versions.
    const since = new Date(Date.parse(applyAt) - 60_000).toISOString();
    const feed = await call(OWNER, 'GET', '/api/notebook/sync/changes', {
      query: { since },
    });
    expect(feed.status).toBe(200);
    expect(
      (feed.body.changes as { id: string; version: number; deleted: boolean }[])
        .map((c) => [c.id, c.version, c.deleted])
        .sort(),
    ).toEqual(
      [
        [PAGE_A, 3, false],
        [PAGE_F, 2, false],
        [DAILY_G, 3, false],
        [TASK_T, 3, false],
      ].sort(),
    );

    // Re-planning after apply finds nothing left to do.
    const again = await planCopyBack(h.doc, opts());
    expect(
      again.filter((e) =>
        ['create', 'undelete', 'overwrite'].includes(e.action),
      ),
    ).toEqual([]);
  });

  it('overwrites a newer live row only with overwriteNewer, and keeps createHash', async () => {
    await seedAndDamage();
    const plan = await planCopyBack(
      h.doc,
      opts({ ids: [DAILY_B], overwriteNewer: true }),
    );
    expect(actions(plan)).toEqual({ [DAILY_B]: 'overwrite' });
    await applyCopyBack(h.doc, opts(), plan);
    expect(
      await ok(OWNER, 'GET', `/api/notebook/notes/${DAILY_B}`),
    ).toMatchObject({ bodyMarkdown: 'original B', version: 3 });
    const raw = await h.doc.send(
      new GetCommand({
        TableName: h.tableName,
        Key: keys.notebook.note.meta(OWNER, DAILY_B),
        ConsistentRead: true,
      }),
    );
    expect(String(raw.Item?.createHash)).toMatch(/^sha256:/);
  });

  it('warns when a task is restored without its deleted note', async () => {
    await seedAndDamage();
    const plan = await planCopyBack(h.doc, opts({ types: ['task'] }));
    expect(plan).toHaveLength(1);
    expect(plan[0]?.warnings[0]).toContain(PAGE_A);
  });

  it('reports a conflict instead of clobbering an edit made after the plan', async () => {
    await seedAndDamage();
    const plan = await planCopyBack(
      h.doc,
      opts({ ids: [DAILY_B], overwriteNewer: true }),
    );
    await ok(OWNER, 'PUT', `/api/notebook/notes/${DAILY_B}`, {
      version: 2,
      bodyMarkdown: 'edited during the copy-back',
    });
    const results = await applyCopyBack(h.doc, opts(), plan);
    expect(results).toEqual([
      expect.objectContaining({ id: DAILY_B, outcome: 'conflict' }),
    ]);
    expect(
      await ok(OWNER, 'GET', `/api/notebook/notes/${DAILY_B}`),
    ).toMatchObject({ bodyMarkdown: 'edited during the copy-back' });
  });

  it('lists ids that are not in the source', async () => {
    await seedAndDamage();
    const plan = await planCopyBack(
      h.doc,
      opts({ ids: ['01ARZ3NDEKTSV4RRFFQ69G5CZZ'] }),
    );
    expect(plan.map((e) => e.action)).toEqual(['skip-not-in-source']);
  });
});
