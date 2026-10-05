import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GetCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import type { Task } from '@gagnechris/shared';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { registerProductionSyncAdapters } from '../../src/sync/adapters.js';
import { SyncLedger } from '../../src/sync/ledger.js';
import { TasksRepository } from '../../src/tasks/repository.js';
import {
  migrateTaskStartDates,
  taskStartDateMigrationExitCode,
  type TaskStartDateMigrationMode,
} from '../../src/tasks/start-date-migration.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';
import { storeAsLegacyTask, testUlid } from '../support/paging-corpus.js';

const USER = 'user-start-dates';
const TODAY = '2026-10-04';
const NOW = '2026-10-02T10:00:00.000Z';
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

describe('task start-date migration (DynamoDB Local)', () => {
  const doc = createLocalDocClient();
  let tableName: string;
  let repo: TasksRepository;

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('task-start-dates');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
    clearSyncEntities();
    registerProductionSyncAdapters();
    repo = new TasksRepository(doc, tableName, () => NOW);
    for (const l of LEGACY) {
      const id = idOf(l.key);
      await repo.createFromRequest(USER, {
        id,
        area: 'work',
        title: SECRET,
        description: SECRET,
        priority: 'med',
        status: l.status,
        startDate: l.startDate,
        tags: ['private'],
      });
      if (l.key !== 'tombstone') {
        await storeAsLegacyTask(doc, tableName, USER, id, l.startDate);
        continue;
      }
      await repo.deleteIfVersion(USER, id, 1);
      await doc.send(
        new UpdateCommand({
          TableName: tableName,
          Key: keys.notebook.task.meta(USER, id),
          UpdateExpression: 'SET dueDate = :due REMOVE startDate, someday',
          ExpressionAttributeValues: { ':due': l.startDate },
        }),
      );
    }
    // Written by the current API: an explicit null start with a dueDate.
    await repo.createFromRequest(USER, {
      id: NEW_NOW,
      area: 'work',
      title: SECRET,
      description: '',
      priority: 'med',
      status: 'todo',
      dueDate: '2026-12-01',
      startDate: null,
      tags: [],
    });
  });

  const run = (mode: TaskStartDateMigrationMode, client = doc) =>
    migrateTaskStartDates({ doc: client, tableName, mode });

  const raw = async (id: string) =>
    (
      await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: keys.notebook.task.meta(USER, id),
          ConsistentRead: true,
        }),
      )
    ).Item!;

  const ids = async (query: Parameters<TasksRepository['list']>[1]) => {
    const all: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repo.list(USER, { ...query, cursor, limit: 2 });
      all.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor;
    } while (cursor);
    return all.sort();
  };

  const views = async () => ({
    today: await ids({ open: true, startOnOrBefore: TODAY, today: TODAY }),
    upcoming: await ids({ open: true, startAfter: TODAY, today: TODAY }),
    doneToday: await ids({ status: 'done', startOn: TODAY, today: TODAY }),
  });

  const served = async (): Promise<Task[]> =>
    Promise.all(
      [...LEGACY.map((l) => idOf(l.key)), NEW_NOW].map(
        async (id) => (await repo.get(USER, id))!,
      ),
    );

  const migratedViews = () => ({
    today: [idOf('past'), idOf('today'), idOf('undated'), NEW_NOW].sort(),
    upcoming: [idOf('future')],
    doneToday: [idOf('doneToday')],
  });

  it('reads an unmigrated row as starting on its dueDate, outside the start-date views', async () => {
    expect((await raw(idOf('past'))).startDate).toBeUndefined();
    expect((await raw(idOf('past'))).gsi1sk).toMatch(/^DUE#2026-09-28#/);

    expect(await repo.get(USER, idOf('future'))).toMatchObject({
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
      table: tableName,
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
    const feedBefore = await new SyncLedger(doc, tableName).queryChangesSince(
      USER,
      {},
    );

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
    const feedAfter = await new SyncLedger(doc, tableName).queryChangesSince(
      USER,
      {},
    );
    expect(feedAfter.changes).toEqual(feedBefore.changes);

    expect(await run('apply')).toMatchObject({ pending: 0, written: 0 });
    expect(taskStartDateMigrationExitCode(await run('verify'))).toBe(0);
  });

  it('never overwrites an API save that lands mid-run', async () => {
    const racing = {
      send: async (command: unknown) => {
        if (command instanceof UpdateCommand) {
          const key = command.input.Key as { pk: string };
          if (key.pk === keys.notebook.task.meta(USER, idOf('past')).pk) {
            await repo.updateFromRequest(USER, idOf('past'), 'any', {
              startDate: '2026-10-20',
            });
          }
        }
        return doc.send(command as never);
      },
    } as unknown as DynamoDBDocumentClient;

    const report = await run('apply', racing);
    expect(report).toMatchObject({ written: 5, conflicts: 1 });
    expect(taskStartDateMigrationExitCode(report)).toBe(1);
    expect(await repo.get(USER, idOf('past'))).toMatchObject({
      startDate: '2026-10-20',
    });
    expect(taskStartDateMigrationExitCode(await run('verify'))).toBe(0);
  });
});
