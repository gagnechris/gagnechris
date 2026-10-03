/**
 * Daily-note claim lifecycle through the real routes (CHR-187).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { keys } from '@gagnechris/data';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes, type RouteDef } from '../src/router.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { createNotesRepository } from '../src/notes/repository.js';
import { createNoteRoutes } from '../src/notes/handlers.js';

const TABLE = 'gagnechris-daily-claim-test';
const USER = 'user-daily-1';
const DAY = '2026-10-04';
const DAILY_PATH = `/api/notebook/notes/daily/work/${DAY}`;
const D1 = '01ARZ3NDEKTSV4RRFFQ48JMD01';
const D2 = '01ARZ3NDEKTSV4RRFFQ48JMD02';
const D3 = '01ARZ3NDEKTSV4RRFFQ48JMD03';
const PAGE = '01ARZ3NDEKTSV4RRFFQ48JMD04';

function setup() {
  const { doc, store } = createMemoryDoc();
  const repo = createNotesRepository(
    doc,
    TABLE,
    () => '2026-10-04T09:00:00.000Z',
  );
  return { store, repo, routes: createNoteRoutes(repo) };
}

async function call(
  routes: RouteDef[],
  method: string,
  path: string,
  body?: unknown,
  ifMatch?: string,
) {
  const res = await dispatchRoutes(
    routes,
    makeEvent(method, path, {
      body,
      headers: ifMatch ? { 'if-match': ifMatch } : undefined,
      jwtClaims: { sub: USER },
    }),
    method,
    path,
  );
  return {
    status: res?.statusCode,
    body: JSON.parse(res!.body as string) as Record<string, unknown>,
  };
}

describe('daily note claim lifecycle (CHR-187)', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
  });

  it('deleting a daily note frees the day for a new one', async () => {
    const { routes } = setup();
    const created = await call(routes, 'PUT', DAILY_PATH, {
      id: D1,
      bodyMarkdown: 'first',
    });
    expect(created.status).toBe(200);

    const deleted = await call(routes, 'DELETE', `/api/notebook/notes/${D1}`, {
      version: 1,
    });
    expect(deleted.status).toBe(200);

    const empty = await call(routes, 'GET', DAILY_PATH);
    expect(empty.body).toMatchObject({ exists: false, version: 0 });

    const again = await call(routes, 'PUT', DAILY_PATH, {
      id: D2,
      bodyMarkdown: 'second',
    });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ id: D2, bodyMarkdown: 'second' });
    expect((await call(routes, 'GET', DAILY_PATH)).body).toMatchObject({
      id: D2,
    });
  });

  it('a claim still held by a tombstone (pre-fix data) reads and writes as free', async () => {
    const { routes, store } = setup();
    await call(routes, 'PUT', DAILY_PATH, { id: D1, bodyMarkdown: 'old' });
    await call(routes, 'DELETE', `/api/notebook/notes/${D1}`, { version: 1 });
    // Recreate the bricked state: claim left pointing at the tombstone.
    const claimKey = keys.notebook.dailyClaim(USER, 'work', DAY);
    store.set(`${claimKey.pk}\0${claimKey.sk}`, {
      ...claimKey,
      noteId: D1,
      userId: USER,
    });

    expect((await call(routes, 'GET', DAILY_PATH)).body).toMatchObject({
      exists: false,
    });
    const viaPut = await call(routes, 'PUT', DAILY_PATH, {
      id: D2,
      bodyMarkdown: 'new',
    });
    expect(viaPut.status).toBe(200);
    expect(viaPut.body).toMatchObject({ id: D2, deleted: false });
  });

  it("a daily note's area cannot change; a page's can", async () => {
    const { routes } = setup();
    await call(routes, 'PUT', DAILY_PATH, { id: D1 });
    const moved = await call(routes, 'PUT', `/api/notebook/notes/${D1}`, {
      version: 1,
      area: 'personal',
    });
    expect(moved.status).toBe(400);
    expect(moved.body.fields).toEqual({ area: 'immutable' });

    await call(routes, 'POST', '/api/notebook/notes', {
      id: PAGE,
      area: 'work',
      type: 'page',
    });
    const pageMoved = await call(routes, 'PUT', `/api/notebook/notes/${PAGE}`, {
      version: 1,
      area: 'personal',
    });
    expect(pageMoved.status).toBe(200);
  });

  it('a placeholder writer that lost the race gets 409 with the winner, never 400', async () => {
    const { routes } = setup();
    await call(routes, 'PUT', DAILY_PATH, { id: D1, bodyMarkdown: 'tab A' });

    // Tab B still has the empty placeholder: its own id, no version.
    const tabB = await call(routes, 'PUT', DAILY_PATH, {
      id: D2,
      bodyMarkdown: 'tab B',
    });
    expect(tabB.status).toBe(409);
    expect(tabB.body).toMatchObject({
      error: 'daily_taken',
      currentVersion: 1,
      current: { id: D1, bodyMarkdown: 'tab A' },
    });

    // Retrying tab A's own create (lost response) is a no-op 200.
    const retry = await call(routes, 'PUT', DAILY_PATH, {
      id: D1,
      bodyMarkdown: 'tab A',
    });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ id: D1, version: 1 });

    // Same id but different content without a version is a real conflict.
    const changed = await call(routes, 'PUT', DAILY_PATH, {
      id: D1,
      bodyMarkdown: 'tab A edited elsewhere',
    });
    expect(changed.status).toBe(409);
    expect(changed.body).toMatchObject({ error: 'version_conflict' });
  });

  it('POST for a taken day returns 409 daily_taken with current', async () => {
    const { routes } = setup();
    await call(routes, 'PUT', DAILY_PATH, { id: D1, bodyMarkdown: 'winner' });
    const loser = await call(routes, 'POST', '/api/notebook/notes', {
      id: D3,
      area: 'work',
      type: 'daily',
      date: DAY,
      bodyMarkdown: 'loser',
    });
    expect(loser.status).toBe(409);
    expect(loser.body).toMatchObject({
      error: 'daily_taken',
      current: { id: D1, bodyMarkdown: 'winner' },
    });
  });
});
