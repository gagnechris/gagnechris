import { beforeEach, describe, expect, it, type Mock } from 'vitest';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes, type RouteDef } from '../src/router.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { NotesRepository } from '../src/notes/repository.js';
import { createNoteRoutes } from '../src/notes/handlers.js';

const TABLE = 'gagnechris-write-reads-test';
const USER = 'user-daily-reads';
const DAY = '2026-10-04';
const DAILY_PATH = `/api/notebook/notes/daily/work/${DAY}`;
const D1 = '01ARZ3NDEKTSV4RRFFQ48JMD01';
const D2 = '01ARZ3NDEKTSV4RRFFQ48JMD02';

const READS = new Set(['GetCommand', 'BatchGetCommand', 'QueryCommand']);
const WRITES = new Set(['PutCommand', 'TransactWriteCommand', 'DeleteCommand']);

type Sent = { constructor: { name: string }; input: Record<string, unknown> };

function setup() {
  const { doc } = createMemoryDoc();
  const repo = new NotesRepository(
    doc,
    TABLE,
    () => '2026-10-04T09:00:00.000Z',
  );
  const send = doc.send as unknown as Mock;
  return { send, routes: createNoteRoutes(repo) };
}

async function call(
  routes: RouteDef[],
  method: string,
  path: string,
  body: unknown,
  ifMatch?: string,
): Promise<{ status?: number; body: Record<string, unknown> }> {
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

const put = (routes: RouteDef[], body: unknown, ifMatch?: string) =>
  call(routes, 'PUT', DAILY_PATH, body, ifMatch);

function readsBeforeFirstWrite(send: Mock): Sent[] {
  const calls = send.mock.calls.map((c) => c[0] as Sent);
  const firstWrite = calls.findIndex((c) => WRITES.has(c.constructor.name));
  expect(firstWrite).toBeGreaterThanOrEqual(0);
  return calls
    .slice(0, firstWrite)
    .filter((c) => READS.has(c.constructor.name));
}

describe('notebook writes read once before writing', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
  });

  it('an autosave with a version does one consistent read before the write', async () => {
    const { send, routes } = setup();
    const created = await put(routes, { id: D1, bodyMarkdown: 'v1' });
    expect(created.status).toBe(200);

    for (const [version, text] of [
      [1, 'v2'],
      [2, 'v3'],
    ] as const) {
      send.mockClear();
      const saved = await put(routes, {
        id: D1,
        version,
        bodyMarkdown: text,
      });
      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({
        version: version + 1,
        bodyMarkdown: text,
      });
      const reads = readsBeforeFirstWrite(send);
      expect(reads).toHaveLength(1);
      expect(reads[0]!.input.ConsistentRead).toBe(true);
    }

    send.mockClear();
    const viaIfMatch = await put(routes, { id: D1, bodyMarkdown: 'v4' }, '"3"');
    expect(viaIfMatch.status).toBe(200);
    expect(readsBeforeFirstWrite(send)).toHaveLength(1);
  });

  it('a create with no version writes before it reads', async () => {
    const { send, routes } = setup();
    const created = await put(routes, { id: D1, bodyMarkdown: 'first' });
    expect(created.status).toBe(200);
    expect(readsBeforeFirstWrite(send)).toHaveLength(0);
  });

  it('a version with an id that is not the day’s note still updates the day’s note', async () => {
    const { routes } = setup();
    await put(routes, { id: D1, bodyMarkdown: 'winner' });
    const res = await put(routes, {
      id: D2,
      version: 1,
      bodyMarkdown: 'merged',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: D1,
      version: 2,
      bodyMarkdown: 'merged',
    });
  });

  it('a stale version is 409 with the current note', async () => {
    const { routes } = setup();
    await put(routes, { id: D1, bodyMarkdown: 'v1' });
    await put(routes, { id: D1, version: 1, bodyMarkdown: 'v2' });
    const stale = await put(routes, {
      id: D1,
      version: 1,
      bodyMarkdown: 'old',
    });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      currentVersion: 2,
      current: { bodyMarkdown: 'v2' },
    });
  });

  it('a delete does one consistent read before the write', async () => {
    const { send, routes } = setup();
    await put(routes, { id: D1, bodyMarkdown: 'v1' });
    send.mockClear();
    const deleted = await call(
      routes,
      'DELETE',
      `/api/notebook/notes/${D1}`,
      undefined,
      '"1"',
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ deleted: true, version: 2 });
    expect(readsBeforeFirstWrite(send)).toHaveLength(1);
  });
});
