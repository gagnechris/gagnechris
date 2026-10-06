import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { keys, syncPk, syncSk } from '@gagnechris/data';
import { SyncLedger } from '../src/sync/ledger.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { registerProductionSyncAdapters } from '../src/sync/adapters.js';
import {
  NOTE_CHANGE_TYPE,
  NotesRepository,
  noteToChange,
} from '../src/notes/repository.js';
import { TASK_CHANGE_TYPE, TasksRepository } from '../src/tasks/repository.js';
import { logger, metrics } from '../src/observability.js';
import { toSyncChange } from '../src/sync/to-sync-change.js';
import { createMemoryDoc } from './support/memory-doc.js';

const TABLE = 'gagnechris-sync-corrupt-test';
const USER = 'user-sync-corrupt';
const NOW = '2026-10-02T12:00:00.000Z';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
const BAD_NOTE = '01ARZ3NDEKTSV4RRFFQ69G5F00';
const BAD_TASK = '01ARZ3NDEKTSV4RRFFQ69G5F01';

describe('sync feed: corrupt rows', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
    registerProductionSyncAdapters();
    vi.restoreAllMocks();
  });

  async function seed() {
    const { doc, store } = createMemoryDoc();
    const clock = () => '2026-10-01T09:00:00.000Z';
    await new NotesRepository(doc, TABLE, clock).createFromRequest(USER, {
      id: NOTE_ID,
      area: 'work',
      type: 'page',
      title: 'Good note',
      bodyMarkdown: '',
      tags: [],
      pinned: false,
    });
    await new TasksRepository(doc, TABLE, clock).createFromRequest(USER, {
      id: TASK_ID,
      area: 'work',
      title: 'Good task',
      description: '',
      priority: 'med',
      status: 'todo',
      dueDate: null,
      startDate: null,
      someday: false,
      tags: [],
    });
    const corrupt = (
      key: { pk: string; sk: string },
      type: string,
      id: string,
    ) =>
      store.set(`${key.pk}\0${key.sk}`, {
        ...key,
        entityType: type,
        id,
        userId: USER,
        // Fails the item schema: no area, title, version, timestamps.
        syncPk: syncPk(USER),
        syncSk: syncSk('2026-09-30T09:00:00.000Z', type, id),
      });
    corrupt(
      keys.notebook.note.meta(USER, BAD_NOTE),
      NOTE_CHANGE_TYPE,
      BAD_NOTE,
    );
    corrupt(
      keys.notebook.task.meta(USER, BAD_TASK),
      TASK_CHANGE_TYPE,
      BAD_TASK,
    );
    return doc;
  }

  it('skips them, logs their keys and counts SyncCorruptRow, and still returns the rest', async () => {
    const doc = await seed();
    const addMetric = vi.spyOn(metrics, 'addMetric');
    const warn = vi.spyOn(logger, 'warn');

    const page = await new SyncLedger(doc, TABLE, () => NOW).queryChangesSince(
      USER,
      {},
    );

    expect(page.changes.map((c) => [c.type, c.id]).sort()).toEqual([
      [NOTE_CHANGE_TYPE, NOTE_ID],
      [TASK_CHANGE_TYPE, TASK_ID],
    ]);
    const corruptMetrics = addMetric.mock.calls.filter(
      ([name]) => name === 'SyncCorruptRow',
    );
    expect(corruptMetrics).toHaveLength(2);
    expect(
      addMetric.mock.calls.some(([name]) => name === 'SyncAdapterMissing'),
    ).toBe(false);
    const logged = warn.mock.calls.map(
      ([, fields]) => (fields as { pk?: string }).pk,
    );
    expect(logged).toEqual(
      expect.arrayContaining([
        keys.notebook.note.meta(USER, BAD_NOTE).pk,
        keys.notebook.task.meta(USER, BAD_TASK).pk,
      ]),
    );
  });

  it('a row of another type is not this adapter’s and is not counted', () => {
    const addMetric = vi.spyOn(metrics, 'addMetric');
    expect(noteToChange({ entityType: TASK_CHANGE_TYPE })).toBeUndefined();
    expect(addMetric).not.toHaveBeenCalled();
  });

  it('an entity that parses but fails the change schema is skipped too', () => {
    const addMetric = vi.spyOn(metrics, 'addMetric');
    const toChange = toSyncChange(
      'thing',
      (item) => ({
        id: String(item.id),
        version: 1,
        deleted: false,
        updatedAt: 'not-a-date',
      }),
      z.object({
        type: z.literal('thing'),
        id: z.string(),
        version: z.number(),
        deleted: z.boolean(),
        updatedAt: z.string().datetime(),
      }),
    );
    expect(toChange({ entityType: 'thing', id: 'x', pk: 'P', sk: 'S' })).toBe(
      undefined,
    );
    expect(addMetric).toHaveBeenCalledWith('SyncCorruptRow', 'Count', 1);
  });
});
