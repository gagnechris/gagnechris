// Eventually consistent GetItem calls are served from a lagging snapshot,
// like a DynamoDB replica would.
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryDoc } from './support/memory-doc.js';
import { makeEvent } from './support/make-event.js';
import { dispatchRoutes } from '../src/router.js';
import { clearSyncEntities } from '../src/sync/registry.js';
import { createNotesRepository } from '../src/notes/repository.js';
import { createNoteRoutes } from '../src/notes/handlers.js';
import { createTasksRepository } from '../src/tasks/repository.js';
import { createTaskRoutes } from '../src/tasks/handlers.js';
import type { RouteDef } from '../src/router.js';

const TABLE = 'gagnechris-stale-test';
const USER = 'user-stale-1';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ48JMS01';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ48JMS02';
const NOW = '2026-10-02T12:00:00.000Z';

/** Memory doc whose non-consistent reads come from a frozen snapshot. */
function createLaggingDoc() {
  const { doc: live, store } = createMemoryDoc();
  let snapshot: Map<string, Record<string, unknown>> | undefined;
  const doc = {
    send: async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      if (
        snapshot &&
        command.constructor.name === 'GetCommand' &&
        command.input.ConsistentRead !== true
      ) {
        const key = command.input.Key as { pk: string; sk: string };
        const item = snapshot.get(`${key.pk}\0${key.sk}`);
        return item ? { Item: { ...item } } : {};
      }
      return live.send(command as never);
    },
  } as unknown as DynamoDBDocumentClient;
  return {
    doc,
    lag: () => {
      snapshot = new Map(
        [...store].map(([k, v]) => [k, structuredClone(v)] as const),
      );
    },
  };
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
    etag: res?.headers?.ETag,
    body: JSON.parse(res!.body as string) as Record<string, unknown>,
  };
}

describe('mutations read consistently', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = TABLE;
    clearSyncEntities();
  });

  it('note PUT/DELETE never revert unsent fields or reuse a version', async () => {
    const { doc, lag } = createLaggingDoc();
    const routes = createNoteRoutes(
      createNotesRepository(doc, TABLE, () => NOW),
    );
    const path = `/api/notebook/notes/${NOTE_ID}`;

    await call(routes, 'POST', '/api/notebook/notes', {
      id: NOTE_ID,
      area: 'work',
      type: 'page',
      title: 't1',
      bodyMarkdown: 'b1',
    });
    lag(); // replica stuck at v1
    const v2 = await call(
      routes,
      'PUT',
      path,
      { version: 1, bodyMarkdown: 'b2-important' },
      '"1"',
    );
    expect(v2.status).toBe(200);
    expect(v2.etag).toBe('"2"');

    const v3 = await call(
      routes,
      'PUT',
      path,
      { version: 2, title: 't3' },
      '"2"',
    );
    expect(v3.status).toBe(200);
    expect(v3.etag).toBe('"3"');
    expect(v3.body).toMatchObject({
      title: 't3',
      bodyMarkdown: 'b2-important',
      version: 3,
      updatedAt: NOW,
    });

    // If-Match: * (wins over body version) against a lagging replica is not a
    // false 412.
    const v4 = await call(
      routes,
      'PUT',
      path,
      { version: 3, title: 't4' },
      '*',
    );
    expect(v4.status).toBe(200);
    expect(v4.body).toMatchObject({ version: 4, bodyMarkdown: 'b2-important' });

    const deleted = await call(routes, 'DELETE', path, { version: 4 });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({
      version: 5,
      deleted: true,
      title: 't4',
      bodyMarkdown: 'b2-important',
    });
  });

  it('task PUT/complete/reopen never revert unsent fields', async () => {
    const { doc, lag } = createLaggingDoc();
    const routes = createTaskRoutes(
      createTasksRepository(doc, TABLE, () => NOW),
    );
    const path = `/api/notebook/tasks/${TASK_ID}`;

    await call(routes, 'POST', '/api/notebook/tasks', {
      id: TASK_ID,
      area: 'work',
      title: 'first',
      description: 'd1',
    });
    lag();
    await call(routes, 'PUT', path, {
      version: 1,
      description: 'd2-important',
    });

    const done = await call(routes, 'POST', `${path}/complete`, { version: 2 });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      status: 'done',
      description: 'd2-important',
      version: 3,
    });

    const reopened = await call(
      routes,
      'POST',
      `${path}/reopen`,
      { version: 1 },
      '*',
    );
    expect(reopened.status).toBe(200);
    expect(reopened.body).toMatchObject({
      status: 'todo',
      description: 'd2-important',
      version: 4,
    });

    const renamed = await call(routes, 'PUT', path, {
      version: 4,
      title: 'second',
    });
    expect(renamed.body).toMatchObject({
      title: 'second',
      status: 'todo',
      description: 'd2-important',
      version: 5,
    });
  });
});
