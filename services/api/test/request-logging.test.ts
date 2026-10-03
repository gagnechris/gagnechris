/**
 * The API must never log request bodies or query values (CHR-196). Runs the
 * real Lambda handler (Powertools logger + metrics) against memory-backed
 * notebook routes and captures everything written to stdout/stderr/console.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { clearSyncEntities } from '../src/sync/registry.js';

const TABLE = 'gagnechris-logging-test';
const USER = 'user-logging-1';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ48JMSC9';

const SEARCH_TERM = 'zebrafinch-q-7f3a91';
const NOTE_TITLE = 'okapi-title-5c21d0';
const NOTE_BODY = 'quokka-body-b84e62';
const UPDATED_BODY = 'narwhal-update-0e9d47';

vi.mock('../src/routes.js', async () => {
  const { createNotesRepository } = await import('../src/notes/repository.js');
  const { createTasksRepository } = await import('../src/tasks/repository.js');
  const { createNoteRoutes } = await import('../src/notes/handlers.js');
  const { createSearchRoutes } = await import('../src/search/handlers.js');
  const { doc } = createMemoryDoc();
  const now = () => '2026-10-03T12:00:00.000Z';
  const notes = createNotesRepository(doc, TABLE, now);
  const tasks = createTasksRepository(doc, TABLE, now);
  return {
    routes: [
      ...createNoteRoutes(notes),
      ...createSearchRoutes({ notes, tasks }),
    ],
  };
});

const { handler } = await import('../src/handler.js');

let captured: string[] = [];
const restore: Array<() => void> = [];

function capture(): void {
  captured = [];
  const record = (chunk: unknown) => {
    captured.push(
      typeof chunk === 'string'
        ? chunk
        : chunk instanceof Uint8Array
          ? Buffer.from(chunk).toString('utf8')
          : String(chunk),
    );
  };
  for (const stream of [process.stdout, process.stderr]) {
    const spy = vi.spyOn(stream, 'write').mockImplementation(((
      chunk: unknown,
    ) => {
      record(chunk);
      return true;
    }) as typeof stream.write);
    restore.push(() => spy.mockRestore());
  }
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const spy = vi.spyOn(console, method).mockImplementation((...args) => {
      record(args.map((a) => JSON.stringify(a) ?? String(a)).join(' '));
    });
    restore.push(() => spy.mockRestore());
  }
}

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Record<string, string> } = {},
) {
  const result = await handler(
    makeEvent(method, path, { ...opts, jwtClaims: { sub: USER } }),
    {} as never,
    () => undefined,
  );
  return result as { statusCode: number; body: string };
}

describe('request logging privacy (CHR-196)', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
    capture();
  });

  afterEach(() => {
    while (restore.length > 0) restore.pop()!();
  });

  it('does not log note create/update bodies or search terms', async () => {
    const created = await call('POST', '/api/notebook/notes', {
      body: {
        id: NOTE_ID,
        area: 'work',
        type: 'page',
        title: NOTE_TITLE,
        bodyMarkdown: NOTE_BODY,
        tags: [],
        pinned: false,
      },
    });
    expect(created.statusCode).toBe(201);

    const updated = await call('PUT', `/api/notebook/notes/${NOTE_ID}`, {
      body: { version: 1, bodyMarkdown: `${NOTE_BODY} ${UPDATED_BODY}` },
    });
    expect(updated.statusCode).toBe(200);

    const searched = await call('POST', '/api/notebook/search', {
      body: { q: SEARCH_TERM },
    });
    expect(searched.statusCode).toBe(200);

    // A rejected body and a stray GET with ?q= must not leak either.
    const invalid = await call('POST', '/api/notebook/search', {
      body: { q: SEARCH_TERM, limit: 'not-a-number' },
    });
    expect(invalid.statusCode).toBe(400);
    const viaGet = await call('GET', '/api/notebook/search', {
      query: { q: SEARCH_TERM },
    });
    expect(viaGet.statusCode).toBe(405);

    const output = captured.join('\n');
    // Sanity: the capture saw the handler's request log lines.
    expect(output).toContain('"message":"request"');
    expect(output).toContain('/api/notebook/search');
    for (const secret of [SEARCH_TERM, NOTE_TITLE, NOTE_BODY, UPDATED_BODY]) {
      expect(output).not.toContain(secret);
    }
  });
});
