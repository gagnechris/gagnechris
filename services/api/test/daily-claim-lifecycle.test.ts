import { beforeEach, describe, expect, it } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes, type RouteDef } from '../src/router.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { NotesRepository } from '../src/notes/repository.js';
import { createNoteRoutes } from '../src/notes/handlers.js';
import { CREATE_TRANSACTION_CONFLICT_RETRIES } from '../src/data/versioned-repository.js';

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
  const repo = new NotesRepository(
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

describe('daily note claim lifecycle', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
  });

  it('deleting a daily note frees the day for a new one', async () => {
    const { routes, store } = setup();
    const created = await call(routes, 'PUT', DAILY_PATH, {
      id: D1,
      bodyMarkdown: 'first',
    });
    expect(created.status).toBe(200);
    const claimKey = keys.notebook.dailyClaim(USER, 'work', DAY);
    expect(store.has(`${claimKey.pk}\0${claimKey.sk}`)).toBe(true);

    const deleted = await call(routes, 'DELETE', `/api/notebook/notes/${D1}`, {
      version: 1,
    });
    expect(deleted.status).toBe(200);
    // The delete itself must free the claim: once the tombstone is purged
    // nothing else knows the day was ever taken.
    expect(store.has(`${claimKey.pk}\0${claimKey.sk}`)).toBe(false);

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

  it('a claim whose holder row is gone (purged tombstone) does not block the day', async () => {
    const { routes, store } = setup();
    await call(routes, 'PUT', DAILY_PATH, { id: D1, bodyMarkdown: 'old' });
    const claimKey = keys.notebook.dailyClaim(USER, 'work', DAY);
    const metaKey = keys.notebook.note.meta(USER, D1);
    store.delete(`${metaKey.pk}\0${metaKey.sk}`);

    expect((await call(routes, 'GET', DAILY_PATH)).body).toMatchObject({
      exists: false,
    });
    const viaPut = await call(routes, 'PUT', DAILY_PATH, {
      id: D2,
      bodyMarkdown: 'new',
    });
    expect(viaPut.status).toBe(200);
    expect(viaPut.body).toMatchObject({ id: D2, bodyMarkdown: 'new' });
    expect(store.get(`${claimKey.pk}\0${claimKey.sk}`)).toMatchObject({
      noteId: D2,
    });

    const OTHER_DAY = '2026-10-05';
    const otherClaim = keys.notebook.dailyClaim(USER, 'work', OTHER_DAY);
    store.set(`${otherClaim.pk}\0${otherClaim.sk}`, {
      ...otherClaim,
      entityType: 'dailyNoteClaim',
      userId: USER,
      area: 'work',
      date: OTHER_DAY,
      noteId: PAGE,
    });
    const viaPost = await call(routes, 'POST', '/api/notebook/notes', {
      id: D3,
      area: 'work',
      type: 'daily',
      date: OTHER_DAY,
      bodyMarkdown: 'post',
    });
    expect(viaPost.status).toBe(201);
    expect(viaPost.body).toMatchObject({ id: D3 });
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

  /**
   * Real DynamoDB cancels concurrent creates of one claim with
   * TransactionConflict; the first `conflicts` writes by the loser fail that
   * way, and `onConflict` lets the winner commit mid-race.
   */
  function contendedRoutes(
    conflicts: number,
    onConflict: (attempt: number, repo: NotesRepository) => Promise<void>,
  ) {
    const { doc } = createMemoryDoc();
    const winnerRepo = new NotesRepository(
      doc,
      TABLE,
      () => '2026-10-04T09:00:00.000Z',
    );
    let attempts = 0;
    const contended = {
      send: async (command: { constructor: { name: string } }) => {
        if (
          command.constructor.name === 'TransactWriteCommand' &&
          attempts < conflicts
        ) {
          attempts += 1;
          await onConflict(attempts, winnerRepo);
          throw Object.assign(new Error('Transaction cancelled'), {
            name: 'TransactionCanceledException',
            CancellationReasons: [
              { Code: 'None' },
              { Code: 'None' },
              { Code: 'TransactionConflict' },
            ],
          });
        }
        return doc.send(command as never);
      },
    } as unknown as DynamoDBDocumentClient;
    const loserRepo = new NotesRepository(
      contended,
      TABLE,
      () => '2026-10-04T09:00:00.000Z',
    );
    return {
      routes: createNoteRoutes(loserRepo),
      attempts: () => attempts,
      winnerRepo,
    };
  }

  const createWinner = (repo: NotesRepository) =>
    repo.createDaily(USER, 'work', DAY, { id: D1, bodyMarkdown: 'winner' });

  it('a loser that keeps hitting TransactionConflict gets daily_taken with the winner', async () => {
    const { routes, attempts } = contendedRoutes(3, async (attempt, repo) => {
      // The winner's transaction commits while the loser is backing off.
      if (attempt === 2) await createWinner(repo);
    });
    const loser = await call(routes, 'PUT', DAILY_PATH, {
      id: D2,
      bodyMarkdown: 'loser',
    });
    expect(loser.status).toBe(409);
    expect(loser.body).toMatchObject({
      error: 'daily_taken',
      currentVersion: 1,
      current: { id: D1, bodyMarkdown: 'winner' },
    });
    expect(attempts()).toBe(2);
  });

  it('a TransactionConflict after the winner committed resolves to daily_taken at once', async () => {
    const { routes, winnerRepo, attempts } = contendedRoutes(5, async () => {});
    await createWinner(winnerRepo);
    const loser = await call(routes, 'POST', '/api/notebook/notes', {
      id: D2,
      area: 'work',
      type: 'daily',
      date: DAY,
      bodyMarkdown: 'loser',
    });
    expect(loser.status).toBe(409);
    expect(loser.body).toMatchObject({
      error: 'daily_taken',
      current: { id: D1 },
    });
    expect(attempts()).toBe(1);
  });

  it('a TransactionConflict with no other writer retries and creates the note', async () => {
    const { routes, attempts } = contendedRoutes(2, async () => {});
    const created = await call(routes, 'PUT', DAILY_PATH, {
      id: D2,
      bodyMarkdown: 'mine',
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ id: D2, version: 1 });
    expect(attempts()).toBe(2);
  });

  it('falls back to a plain conflict only once the retries run out', async () => {
    const { routes, attempts } = contendedRoutes(100, async () => {});
    const res = await call(routes, 'PUT', DAILY_PATH, { id: D2 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'conflict' });
    expect(attempts()).toBe(1 + CREATE_TRANSACTION_CONFLICT_RETRIES);
  });
});
