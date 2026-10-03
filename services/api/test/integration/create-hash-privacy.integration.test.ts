/**
 * createHash privacy + notebook size limits on DynamoDB Local (CHR-192).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { NOTEBOOK_TEXT_MAX_BYTES } from '@gagnechris/shared';
import { dispatchRoutes, type RouteDef } from '../../src/router.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { createNoteRoutes } from '../../src/notes/handlers.js';
import { NotesRepository } from '../../src/notes/repository.js';
import { createTaskRoutes } from '../../src/tasks/handlers.js';
import { TasksRepository } from '../../src/tasks/repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';
import { makeEvent } from '../support/make-event.js';

const USER = 'user-create-hash';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5HA1';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5HA2';
const BIG_ID = '01ARZ3NDEKTSV4RRFFQ69G5HA3';
const SECRET = 'my bank password is hunter2';

describe('createHash privacy and size limits (CHR-192)', () => {
  let tableName: string;
  let routes: RouteDef[];
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('create-hash');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
    clearSyncEntities();
    const notes = new NotesRepository(doc, tableName);
    const tasks = new TasksRepository(doc, tableName);
    routes = [...createNoteRoutes(notes), ...createTaskRoutes(tasks, notes)];
  });

  async function call(method: string, path: string, body?: unknown) {
    const res = await dispatchRoutes(
      routes,
      makeEvent(method, path, { body, jwtClaims: { sub: USER } }),
      method,
      path,
    );
    return {
      status: res?.statusCode,
      body: JSON.parse(res!.body as string) as Record<string, unknown>,
    };
  }

  async function scanAll(): Promise<Record<string, unknown>[]> {
    const out = await doc.send(new ScanCommand({ TableName: tableName }));
    return (out.Items ?? []) as Record<string, unknown>[];
  }

  const createNote = (bodyMarkdown: string, id = NOTE_ID) =>
    call('POST', '/api/notebook/notes', {
      id,
      area: 'work',
      type: 'page',
      title: 'Secrets',
      bodyMarkdown,
    });

  it('keeps no copy of the original text after edit and delete', async () => {
    expect((await createNote(SECRET)).status).toBe(201);
    const task = await call('POST', '/api/notebook/tasks', {
      id: TASK_ID,
      area: 'work',
      title: 'Task',
      description: SECRET,
    });
    expect(task.status).toBe(201);

    for (const item of await scanAll()) {
      if (typeof item.createHash === 'string') {
        expect(item.createHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      }
    }

    const edited = await call('PUT', `/api/notebook/notes/${NOTE_ID}`, {
      version: 1,
      bodyMarkdown: 'redacted',
    });
    expect(edited.status).toBe(200);
    const editedTask = await call('PUT', `/api/notebook/tasks/${TASK_ID}`, {
      version: 1,
      description: 'redacted',
    });
    expect(editedTask.status).toBe(200);

    expect(
      (await call('DELETE', `/api/notebook/notes/${NOTE_ID}`, { version: 2 }))
        .status,
    ).toBe(200);
    expect(
      (await call('DELETE', `/api/notebook/tasks/${TASK_ID}`, { version: 2 }))
        .status,
    ).toBe(200);

    const items = await scanAll();
    expect(items.length).toBeGreaterThan(0);
    expect(JSON.stringify(items)).not.toContain('hunter2');
    // Tombstones and create claims don't carry a fingerprint at all.
    for (const item of items) {
      expect(item.createHash, String(item.pk)).toBeUndefined();
    }
  });

  it('replays an identical create and rejects a different payload', async () => {
    const first = await createNote(SECRET);
    expect(first.status).toBe(201);
    const replay = await createNote(SECRET);
    expect(replay.status).toBe(201);
    expect(replay.body).toMatchObject({ id: NOTE_ID, version: 1 });

    const mismatch = await createNote('something else');
    expect(mismatch.status).toBe(409);
    expect(mismatch.body).toMatchObject({ error: 'payload_mismatch' });
  });

  it('still replays rows written with the pre-CHR-192 plaintext hash', async () => {
    expect((await createNote(SECRET)).status).toBe(201);
    const meta = (await scanAll()).find(
      (item) => typeof item.createHash === 'string',
    )!;
    const legacy = [USER, 'work', 'page', '', 'Secrets', SECRET, '', '0'].join(
      '\0',
    );
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: { ...meta, createHash: legacy },
      }),
    );

    expect((await createNote(SECRET)).status).toBe(201);
    expect((await createNote('different')).status).toBe(409);
  });

  it('accepts a body at the limit and returns 413 just over it', async () => {
    const atLimit = await createNote('a'.repeat(NOTEBOOK_TEXT_MAX_BYTES));
    expect(atLimit.status).toBe(201);

    // Multi-byte text counts by UTF-8 size, not characters.
    const over = await createNote(
      'é'.repeat(NOTEBOOK_TEXT_MAX_BYTES / 2 + 1),
      BIG_ID,
    );
    expect(over.status).toBe(413);
    expect(over.body).toMatchObject({
      error: 'payload_too_large',
      fields: { bodyMarkdown: 'too_big' },
    });

    const update = await call('PUT', `/api/notebook/notes/${NOTE_ID}`, {
      version: 1,
      bodyMarkdown: 'b'.repeat(NOTEBOOK_TEXT_MAX_BYTES + 1),
    });
    expect(update.status).toBe(413);

    const daily = await call(
      'PUT',
      '/api/notebook/notes/daily/work/2026-10-03',
      {
        id: BIG_ID,
        bodyMarkdown: 'c'.repeat(NOTEBOOK_TEXT_MAX_BYTES + 1),
      },
    );
    expect(daily.status).toBe(413);

    const task = await call('POST', '/api/notebook/tasks', {
      id: TASK_ID,
      area: 'work',
      title: 't'.repeat(301),
    });
    expect(task.status).toBe(413);
    expect(task.body).toMatchObject({ fields: { title: 'too_big' } });
  });
});
