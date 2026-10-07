import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes } from '../src/router.js';
import { registerProductionSyncAdapters } from '../src/sync/adapters.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { NotesRepository } from '../src/notes/repository.js';
import { createNoteRoutes } from '../src/notes/handlers.js';
import { TasksRepository } from '../src/tasks/repository.js';
import { createTaskRoutes } from '../src/tasks/handlers.js';

const TABLE = 'gagnechris-calendar-dates-test';
const USER = 'user-calendar-1';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ48JMTA9';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ48JMN09';
const NOW = () => '2026-10-02T12:00:00.000Z';

const send = async (
  method: string,
  path: string,
  options: { body?: unknown; query?: Record<string, string> } = {},
) => {
  const { doc } = createMemoryDoc();
  const routes = [
    ...createTaskRoutes(new TasksRepository(doc, TABLE, NOW)),
    ...createNoteRoutes(new NotesRepository(doc, TABLE, NOW)),
  ];
  const response = await dispatchRoutes(
    routes,
    makeEvent(method, path, { ...options, jwtClaims: { sub: USER } }),
    method,
    path,
  );
  return response?.statusCode;
};

describe('impossible calendar dates', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
    registerProductionSyncAdapters();
  });

  const task = { id: TASK_ID, area: 'work', title: 'Plan' };

  it.each([
    ['task startDate', { ...task, startDate: '2026-02-30' }],
    ['task dueDate', { ...task, dueDate: '2026-13-01' }],
  ])('a %s is a 400', async (_name, body) => {
    expect(await send('POST', '/api/notebook/tasks', { body })).toBe(400);
  });

  it('a real date still creates the task', async () => {
    expect(
      await send('POST', '/api/notebook/tasks', {
        body: { ...task, startDate: '2028-02-29' },
      }),
    ).toBe(201);
  });

  it('a daily note on an impossible date is a 400', async () => {
    expect(
      await send('POST', '/api/notebook/notes', {
        body: { id: NOTE_ID, area: 'work', type: 'daily', date: '2026-02-30' },
      }),
    ).toBe(400);
    expect(await send('GET', '/api/notebook/notes/daily/work/2026-02-30')).toBe(
      400,
    );
    expect(
      await send('PUT', '/api/notebook/notes/daily/work/2026-04-31', {
        body: { id: NOTE_ID, bodyMarkdown: 'x' },
      }),
    ).toBe(400);
  });

  it('an impossible list-range date is a 400', async () => {
    expect(
      await send('GET', '/api/notebook/notes', {
        query: { from: '2026-02-30', to: '2026-03-31' },
      }),
    ).toBe(400);
    expect(
      await send('GET', '/api/notebook/tasks', {
        query: { startOnOrBefore: '2026-02-30' },
      }),
    ).toBe(400);
  });
});
