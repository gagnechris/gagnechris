import { beforeEach, describe, expect, it } from 'vitest';
import {
  GetCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { keys, taskDueGsi1Sk } from '@gagnechris/data';
import {
  migrateTaskStartDates,
  taskStartDateMigrationExitCode,
  type TaskStartDateMigrationMode,
} from '@gagnechris/ops/task-start-date-migration';
import { testUlid } from '../support/paging-cases.js';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER = 'user-start-dates';
const TODAY = '2026-10-04';
const SECRET = 'confidential-task-title';

const LEGACY = [
  { key: 'past', startDate: '2026-09-28', status: 'todo' },
  { key: 'today', startDate: TODAY, status: 'in_progress' },
  { key: 'future', startDate: '2026-10-11', status: 'todo' },
  { key: 'undated', startDate: null, status: 'todo' },
  { key: 'doneToday', startDate: TODAY, status: 'done' },
  { key: 'tombstone', startDate: '2026-09-30', status: 'todo' },
] as const;

const idOf = (key: string) =>
  testUlid('M', LEGACY.findIndex((l) => l.key === key) + 1);
const NEW_NOW = testUlid('M', 20);

// Bodies are whatever JSON the server sent; tests assert on their shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const h = useApi('task-start-dates');

async function ok(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Record<string, string | number> } = {},
): Promise<Json> {
  const res = await h.api.request(method, path, {
    ...opts,
    claims: notebookUser(USER),
  });
  expect(
    res.status >= 200 && res.status < 300,
    `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBe(true);
  return res.body;
}

/** Rewrites a task row to the shape stored before startDate existed. */
async function storeAsLegacyTask(
  id: string,
  startDate: string | null,
): Promise<void> {
  await h.doc.send(
    new UpdateCommand({
      TableName: h.tableName,
      Key: keys.notebook.task.meta(USER, id),
      UpdateExpression: startDate
        ? 'SET dueDate = :due, gsi1sk = :sk REMOVE startDate, someday'
        : 'SET dueDate = :due REMOVE startDate, someday',
      ExpressionAttributeValues: {
        ':due': startDate,
        ...(startDate ? { ':sk': taskDueGsi1Sk(startDate, id) } : {}),
      },
    }),
  );
}

describe('task start-date migration (DynamoDB Local)', () => {
  beforeEach(async () => {
    for (const l of LEGACY) {
      const id = idOf(l.key);
      await ok('POST', '/api/notebook/tasks', {
        body: {
          id,
          area: 'work',
          title: SECRET,
          description: SECRET,
          priority: 'med',
          status: l.status,
          startDate: l.startDate,
          tags: ['private'],
        },
      });
      if (l.key !== 'tombstone') {
        await storeAsLegacyTask(id, l.startDate);
        continue;
      }
      await ok('DELETE', `/api/notebook/tasks/${id}`, {
        body: { version: 1 },
      });
      await h.doc.send(
        new UpdateCommand({
          TableName: h.tableName,
          Key: keys.notebook.task.meta(USER, id),
          UpdateExpression: 'SET dueDate = :due REMOVE startDate, someday',
          ExpressionAttributeValues: { ':due': l.startDate },
        }),
      );
    }
    // Written by the current API: an explicit null start with a dueDate.
    await ok('POST', '/api/notebook/tasks', {
      body: {
        id: NEW_NOW,
        area: 'work',
        title: SECRET,
        description: '',
        priority: 'med',
        status: 'todo',
        dueDate: '2026-12-01',
        startDate: null,
        tags: [],
      },
    });
  });

  const run = (mode: TaskStartDateMigrationMode, client = h.doc) =>
    migrateTaskStartDates({ doc: client, tableName: h.tableName, mode });

  const raw = async (id: string) =>
    (
      await h.doc.send(
        new GetCommand({
          TableName: h.tableName,
          Key: keys.notebook.task.meta(USER, id),
          ConsistentRead: true,
        }),
      )
    ).Item!;

  const ids = async (query: Record<string, string>) => {
    const all: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await ok('GET', '/api/notebook/tasks', {
        query: { ...query, ...(cursor ? { cursor } : {}), limit: 2 },
      });
      all.push(...(page.items as { id: string }[]).map((t) => t.id));
      cursor = page.nextCursor;
    } while (cursor);
    return all.sort();
  };

  const views = async () => ({
    today: await ids({ open: 'true', startOnOrBefore: TODAY, today: TODAY }),
    upcoming: await ids({ open: 'true', startAfter: TODAY, today: TODAY }),
    doneToday: await ids({ status: 'done', startOn: TODAY, today: TODAY }),
  });

  const served = async (): Promise<Json[]> =>
    Promise.all(
      [...LEGACY.map((l) => idOf(l.key)), NEW_NOW].map(async (id) => {
        const res = await h.api.request('GET', `/api/notebook/tasks/${id}`, {
          claims: notebookUser(USER),
        });
        return { status: res.status, body: res.body };
      }),
    );

  const feed = async () =>
    (await ok('GET', '/api/notebook/sync/changes')).changes as Json[];

  const migratedViews = () => ({
    today: [idOf('past'), idOf('today'), idOf('undated'), NEW_NOW].sort(),
    upcoming: [idOf('future')],
    doneToday: [idOf('doneToday')],
  });

  it('serves an unmigrated row as starting on its dueDate, outside the start-date views', async () => {
    expect((await raw(idOf('past'))).startDate).toBeUndefined();
    expect((await raw(idOf('past'))).gsi1sk).toMatch(/^DUE#2026-09-28#/);

    expect(
      await ok('GET', `/api/notebook/tasks/${idOf('future')}`),
    ).toMatchObject({
      startDate: '2026-10-11',
      dueDate: '2026-10-11',
      someday: false,
    });
    expect(await views()).toEqual({
      today: [idOf('undated'), NEW_NOW].sort(),
      upcoming: [],
      doneToday: [],
    });
  });

  it('dry run reports counts only and writes nothing', async () => {
    const report = await run('dry-run');
    expect(report).toEqual({
      table: h.tableName,
      mode: 'dry-run',
      scanned: expect.any(Number),
      tasks: 7,
      alreadyMigrated: 1,
      pending: 6,
      pendingDated: 4,
      pendingUndated: 1,
      pendingTombstones: 1,
      written: 0,
      conflicts: 0,
    });
    const printed = JSON.stringify(report);
    expect(printed).not.toContain(SECRET);
    expect(printed).not.toContain('private');
    expect(printed).not.toContain(idOf('past'));
    expect((await raw(idOf('past'))).startDate).toBeUndefined();
    expect(taskStartDateMigrationExitCode(await run('verify'))).toBe(2);
  });

  it('--apply puts every task in its start-date view, changes nothing served, and is idempotent', async () => {
    const servedBefore = await served();
    const feedBefore = await feed();

    const applied = await run('apply');
    expect(applied).toMatchObject({ pending: 6, written: 6, conflicts: 0 });
    expect(taskStartDateMigrationExitCode(applied)).toBe(0);

    expect(await raw(idOf('past'))).toMatchObject({
      startDate: '2026-09-28',
      someday: false,
      gsi1sk: `START#2026-09-28#TASK#${idOf('past')}`,
    });
    expect((await raw(idOf('undated'))).gsi1sk).toMatch(/^UPDATED#/);
    expect((await raw(idOf('tombstone'))).gsi1sk).toBeUndefined();
    expect((await raw(NEW_NOW)).startDate).toBeNull();

    expect(await views()).toEqual(migratedViews());
    expect(await served()).toEqual(servedBefore);
    expect(await feed()).toEqual(feedBefore);

    expect(await run('apply')).toMatchObject({ pending: 0, written: 0 });
    expect(taskStartDateMigrationExitCode(await run('verify'))).toBe(0);
  });

  it('never overwrites an API save that lands mid-run', async () => {
    const racing = {
      send: async (command: unknown) => {
        if (command instanceof UpdateCommand) {
          const key = command.input.Key as { pk: string };
          if (key.pk === keys.notebook.task.meta(USER, idOf('past')).pk) {
            await ok('PUT', `/api/notebook/tasks/${idOf('past')}`, {
              body: { version: 1, startDate: '2026-10-20' },
            });
          }
        }
        return h.doc.send(command as never);
      },
    } as unknown as DynamoDBDocumentClient;

    const report = await run('apply', racing);
    expect(report).toMatchObject({ written: 5, conflicts: 1 });
    expect(taskStartDateMigrationExitCode(report)).toBe(1);
    expect(
      await ok('GET', `/api/notebook/tasks/${idOf('past')}`),
    ).toMatchObject({ startDate: '2026-10-20' });
    expect(taskStartDateMigrationExitCode(await run('verify'))).toBe(0);
  });
});
