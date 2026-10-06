import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_GROUPS } from '@gagnechris/shared';
import { dispatchRoutes, type RouteDef } from '../../src/router.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { createNoteRoutes } from '../../src/notes/handlers.js';
import { NotesRepository } from '../../src/notes/repository.js';
import { TasksRepository } from '../../src/tasks/repository.js';
import { createUserRoutes } from '../../src/users/handlers.js';
import { MemoryUserDirectory } from '../../src/users/memory-directory.js';
import { RemovedUsersRepository } from '../../src/users/removed-users.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';
import { makeEvent } from '../support/make-event.js';

const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5W01';

describe('removing and re-inviting a user keeps their Notebook', () => {
  let tableName: string;
  let routes: RouteDef[];
  let directory: MemoryUserDirectory;
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('users');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
    clearSyncEntities();
    directory = new MemoryUserDirectory([
      {
        id: 'owner',
        email: 'owner@example.com',
        name: null,
        enabled: true,
        status: 'CONFIRMED',
        createdAt: null,
        groups: [...ACCESS_GROUPS],
      },
    ]);
    const notes = new NotesRepository(doc, tableName);
    routes = [
      ...createNoteRoutes(notes, new TasksRepository(doc, tableName)),
      ...createUserRoutes({
        directory,
        removed: new RemovedUsersRepository(doc, tableName),
      }),
    ];
  });

  async function call(
    sub: string,
    method: string,
    path: string,
    body?: unknown,
  ) {
    const res = await dispatchRoutes(
      routes,
      makeEvent(method, path, { body, jwtClaims: { sub } }),
      method,
      path,
    );
    return {
      status: res.statusCode,
      body: JSON.parse(res.body as string) as Record<string, unknown>,
    };
  }

  it('the same email comes back as the same sub with the same notes', async () => {
    const invited = await call('owner', 'POST', '/api/admin/users', {
      email: 'friend@example.com',
      level: 'notebook',
    });
    const friend = (invited.body.user as { id: string }).id;

    expect(
      (
        await call(friend, 'POST', '/api/notebook/notes', {
          id: NOTE_ID,
          area: 'personal',
          type: 'page',
          title: 'Kept',
        })
      ).status,
    ).toBe(201);

    const removed = await call(
      'owner',
      'POST',
      `/api/admin/users/${friend}/remove`,
    );
    expect(removed.body.user).toMatchObject({
      status: 'removed',
      level: 'notebook',
    });
    expect(await directory.getUser(friend)).toMatchObject({
      enabled: false,
      groups: [],
    });
    const listed = await call('owner', 'GET', '/api/admin/users');
    expect(listed.body.users).toContainEqual(
      expect.objectContaining({ id: friend, status: 'removed' }),
    );

    const again = await call('owner', 'POST', '/api/admin/users', {
      email: 'friend@example.com',
      level: 'notebook',
    });
    expect(again.body).toMatchObject({
      restored: true,
      user: { id: friend, status: 'invited', level: 'notebook' },
    });

    const notes = await call(friend, 'GET', '/api/notebook/notes');
    expect(notes.body.items).toContainEqual(
      expect.objectContaining({ id: NOTE_ID, title: 'Kept' }),
    );
  });
});
