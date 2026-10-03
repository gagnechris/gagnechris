import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes } from '../src/router.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { createNotesRepository } from '../src/notes/repository.js';
import { createNoteRoutes } from '../src/notes/handlers.js';
import { createTasksRepository } from '../src/tasks/repository.js';
import { createTaskRoutes } from '../src/tasks/handlers.js';
import { createSearchRoutes } from '../src/search/handlers.js';
import { rankTextFields } from '../src/search/match.js';

const TABLE = 'gagnechris-search-test';
const USER = 'user-search-1';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ48JMSC1';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ48JMTC6';

function adminEvent(
  method: string,
  path: string,
  opts?: { body?: unknown; query?: Record<string, string> },
) {
  return makeEvent(method, path, {
    ...opts,
    jwtClaims: { sub: USER },
  });
}

describe('rankTextFields', () => {
  it('prefers title matches and returns snippet ranges', () => {
    const hit = rankTextFields('ship', {
      title: 'Ship API',
      body: 'details about shipping',
      tags: [],
    });
    expect(hit?.title).toBe('Ship API');
    expect(hit?.matches.length).toBeGreaterThan(0);
  });
});

describe('search handlers (CHR-46)', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
  });

  it('returns grouped note and task hits for q', async () => {
    const { doc } = createMemoryDoc();
    const notes = createNotesRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const tasks = createTasksRepository(
      doc,
      TABLE,
      () => '2026-10-02T12:00:00.000Z',
    );
    const routes = [
      ...createNoteRoutes(notes),
      ...createTaskRoutes(tasks),
      ...createSearchRoutes({ notes, tasks }),
    ];

    await notes.createFromRequest(USER, {
      id: NOTE_ID,
      area: 'work',
      type: 'page',
      title: 'Launch checklist',
      bodyMarkdown: 'Remember to ship the search palette',
      tags: ['notebook'],
      pinned: false,
    });
    await tasks.createFromRequest(USER, {
      id: TASK_ID,
      area: 'work',
      title: 'Ship search',
      description: '⌘K palette',
      priority: 'high',
      status: 'todo',
      tags: [],
    });

    const res = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/search', { body: { q: 'ship' } }),
      'POST',
      '/api/notebook/search',
    );
    expect(res?.statusCode).toBe(200);
    // Search results are user data: never cached by the browser (CHR-196).
    expect(res.headers?.['Cache-Control']).toBe('no-store');
    expect(res.headers?.['X-Content-Type-Options']).toBe('nosniff');
    const body = JSON.parse(res!.body as string) as {
      notes: Array<{ id: string }>;
      tasks: Array<{ id: string; title: string }>;
    };
    expect(body.notes.some((n) => n.id === NOTE_ID)).toBe(true);
    expect(body.tasks.some((t) => t.id === TASK_ID)).toBe(true);
    expect(body.tasks[0]?.title).toMatch(/Ship/i);
  });

  it('rejects GET with q in the URL; search is POST-only (CHR-196)', async () => {
    const routes = createSearchRoutes();
    const res = await dispatchRoutes(
      routes,
      adminEvent('GET', '/api/notebook/search', { query: { q: 'ship' } }),
      'GET',
      '/api/notebook/search',
    );
    expect(res.statusCode).toBe(405);
    expect(res.headers?.Allow).toBe('POST');
    expect(res.headers?.['Cache-Control']).toBe('no-store');
  });

  it('validates the JSON body', async () => {
    const routes = createSearchRoutes();
    const res = await dispatchRoutes(
      routes,
      adminEvent('POST', '/api/notebook/search', {
        body: { q: '', limit: 500 },
      }),
      'POST',
      '/api/notebook/search',
    );
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string) as {
      fields: Record<string, string>;
    };
    expect(Object.keys(body.fields).sort()).toEqual(['limit', 'q']);
  });
});
