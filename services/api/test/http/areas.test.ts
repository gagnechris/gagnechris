import { describe, expect, it } from 'vitest';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import {
  ITEM_SCHEMAS,
  buildNoteMetaItem,
  buildTaskMetaItem,
  keys,
} from '@gagnechris/data';
import {
  DEFAULT_DAILY_TEMPLATES,
  NOTEBOOK_AREAS_MAX,
} from '@gagnechris/shared';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const PATH = '/api/notebook/areas';
const DAY = '2026-10-14';
const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
const DEFAULTS = [
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
];
const WITH_FAMILY = [...DEFAULTS, { id: 'family', name: 'Family' }];

const h = useApi('areas-http');
const { call, ok } = apiCalls(h);

const user = (name: string) => `user-areas-${name}`;
const listed = async (path: string, as: string, query = {}) =>
  (await ok('GET', path, { user: as, query })).items.map(
    (i: { id: string }) => i.id,
  );

describe('Notebook areas over HTTP (DynamoDB Local)', () => {
  it('serves Work and Personal until the list is saved, storing nothing', async () => {
    const as = user('defaults');
    const res = await call('GET', PATH, { user: as });
    expect(res).toMatchObject({
      status: 200,
      etag: '"0"',
      body: { areas: DEFAULTS, version: 0, updatedAt: null },
    });
    const stored = await h.doc.send(
      new GetCommand({
        TableName: h.tableName,
        Key: keys.notebook.areas(as),
      }),
    );
    expect(stored.Item).toBeUndefined();
  });

  it('adds a third area whose daily note, tasks and lists work like the others', async () => {
    const as = user('family');
    const saved = await call('PUT', PATH, {
      user: as,
      body: { areas: WITH_FAMILY },
      ifMatch: '"0"',
    });
    expect(saved).toMatchObject({
      status: 200,
      etag: '"1"',
      body: { areas: WITH_FAMILY, version: 1, updatedAt: ISO },
    });
    const row = await h.doc.send(
      new GetCommand({ TableName: h.tableName, Key: keys.notebook.areas(as) }),
    );
    expect(ITEM_SCHEMAS.notebookAreas.parse(row.Item)).toMatchObject({
      entityType: 'notebookAreas',
      userId: as,
      areas: WITH_FAMILY,
      version: 1,
    });

    const template = await ok('GET', '/api/notebook/templates/daily/family', {
      user: as,
    });
    expect(template).toMatchObject({
      area: 'family',
      bodyMarkdown: '',
      isDefault: true,
    });
    const empty = await ok('GET', `/api/notebook/notes/daily/family/${DAY}`, {
      user: as,
    });
    expect(empty).toMatchObject({
      exists: false,
      area: 'family',
      templateMarkdown: '',
    });

    const noteId = ulid();
    const note = await ok('PUT', `/api/notebook/notes/daily/family/${DAY}`, {
      user: as,
      body: { id: noteId, bodyMarkdown: 'Pack for the cabin' },
    });
    expect(note).toMatchObject({ id: noteId, area: 'family', type: 'daily' });
    const taskId = ulid();
    expect(
      await ok('POST', '/api/notebook/tasks', {
        user: as,
        body: { id: taskId, area: 'family', title: 'Book the cabin' },
      }),
    ).toMatchObject({ id: taskId, area: 'family' });
    const workTask = ulid();
    await ok('POST', '/api/notebook/tasks', {
      user: as,
      body: { id: workTask, area: 'work', title: 'Book the offsite' },
    });

    expect(await listed('/api/notebook/notes', as, { area: 'family' })).toEqual(
      [noteId],
    );
    expect(await listed('/api/notebook/notes', as)).toEqual([noteId]);
    expect(await listed('/api/notebook/tasks', as, { area: 'family' })).toEqual(
      [taskId],
    );
    expect((await listed('/api/notebook/tasks', as)).sort()).toEqual(
      [taskId, workTask].sort(),
    );

    const search = await ok('POST', '/api/notebook/search', {
      user: as,
      body: { q: 'cabin' },
    });
    const hits = (list: { id: string; area: string }[]) =>
      list.map((i) => [i.id, i.area]);
    expect(hits(search.notes)).toEqual([[noteId, 'family']]);
    expect(hits(search.tasks)).toEqual([[taskId, 'family']]);
    const scoped = await ok('POST', '/api/notebook/search', {
      user: as,
      body: { q: 'book', area: 'family' },
    });
    expect(scoped.tasks.map((i: { id: string }) => i.id)).toEqual([taskId]);
  });

  it('caps the list at four areas', async () => {
    const as = user('cap');
    const four = [...WITH_FAMILY, { id: 'health', name: 'Health' }].slice(
      0,
      NOTEBOOK_AREAS_MAX,
    );
    expect(
      await call('PUT', PATH, { user: as, body: { version: 0, areas: four } }),
    ).toMatchObject({ status: 200, body: { areas: four, version: 1 } });
    const fifth = await call('PUT', PATH, {
      user: as,
      body: { version: 1, areas: [...four, { id: 'garden', name: 'Garden' }] },
    });
    expect(fifth.status).toBe(400);
    expect(fifth.body).toMatchObject({ fields: { areas: 'too_big' } });
    expect((await ok('GET', PATH, { user: as })).areas).toEqual(four);
  });

  it('renames an area without touching its notes and tasks, and fills {{area}} with the new name', async () => {
    const as = user('rename');
    await ok('PUT', PATH, {
      user: as,
      body: { version: 0, areas: WITH_FAMILY },
    });
    const taskId = ulid();
    const task = await ok('POST', '/api/notebook/tasks', {
      user: as,
      body: { id: taskId, area: 'family', title: 'Call grandma' },
    });
    const noteId = ulid();
    await ok('POST', '/api/notebook/notes', {
      user: as,
      body: { id: noteId, area: 'family', type: 'page', title: 'Recipes' },
    });
    await ok('PUT', '/api/notebook/templates/daily/family', {
      user: as,
      body: { version: 0, bodyMarkdown: '# {{area}} day' },
    });

    const renamed = [...DEFAULTS, { id: 'family', name: 'Kids' }];
    expect(
      await ok('PUT', PATH, { user: as, body: { version: 1, areas: renamed } }),
    ).toMatchObject({ areas: renamed, version: 2 });

    expect(
      await ok('GET', `/api/notebook/tasks/${taskId}`, { user: as }),
    ).toEqual(task);
    expect(await listed('/api/notebook/notes', as, { area: 'family' })).toEqual(
      [noteId],
    );
    expect(
      (await ok('GET', `/api/notebook/notes/daily/family/${DAY}`, { user: as }))
        .templateMarkdown,
    ).toBe('# Kids day');
  });

  it("refuses to remove an area that still has notes or tasks, then removes it with its template once it's empty", async () => {
    const as = user('remove');
    await ok('PUT', PATH, {
      user: as,
      body: { version: 0, areas: WITH_FAMILY },
    });
    await ok('PUT', '/api/notebook/templates/daily/family', {
      user: as,
      body: { version: 0, bodyMarkdown: '## Plans\n' },
    });
    const taskId = ulid();
    const task = await ok('POST', '/api/notebook/tasks', {
      user: as,
      body: { id: taskId, area: 'family', title: 'Plan the picnic' },
    });

    const refused = await call('PUT', PATH, {
      user: as,
      body: { areas: DEFAULTS },
      ifMatch: '"1"',
    });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      error: 'conflict',
      message:
        'Family still has notes or tasks. Move or delete them before removing it.',
    });

    await ok('PUT', `/api/notebook/tasks/${taskId}`, {
      user: as,
      body: { version: task.version, area: 'personal' },
    });
    expect(
      await ok('PUT', PATH, {
        user: as,
        body: { version: 1, areas: DEFAULTS },
      }),
    ).toMatchObject({ areas: DEFAULTS, version: 2 });
    const template = await h.doc.send(
      new GetCommand({
        TableName: h.tableName,
        Key: keys.notebook.dailyTemplate(as, 'family'),
      }),
    );
    expect(template.Item).toBeUndefined();

    const orphan = await call('POST', '/api/notebook/tasks', {
      user: as,
      body: { id: ulid(), area: 'family', title: 'Too late' },
    });
    expect(orphan).toMatchObject({
      status: 400,
      body: { fields: { area: 'not_found' } },
    });
  });

  it('rejects stale versions, repeated ids, bad slugs and an empty list', async () => {
    const as = user('invalid');
    await ok('PUT', PATH, {
      user: as,
      body: { version: 0, areas: WITH_FAMILY },
    });
    expect(
      await call('PUT', PATH, {
        user: as,
        body: { version: 0, areas: DEFAULTS },
      }),
    ).toMatchObject({
      status: 409,
      body: { error: 'version_conflict', currentVersion: 1 },
    });
    expect(
      await call('PUT', PATH, {
        user: as,
        body: { areas: DEFAULTS },
        ifMatch: '"0"',
      }),
    ).toMatchObject({ status: 412 });
    expect(
      await call('PUT', PATH, { user: as, body: { areas: DEFAULTS } }),
    ).toMatchObject({ status: 400 });

    const bad = async (areas: unknown) =>
      (await call('PUT', PATH, { user: as, body: { version: 1, areas } })).body;
    expect(
      await bad([
        { id: 'work', name: 'Work' },
        { id: 'work', name: 'Job' },
      ]),
    ).toMatchObject({ fields: { 'areas.1.id': 'custom' } });
    expect(await bad([{ id: 'All Areas', name: 'All' }])).toMatchObject({
      fields: { 'areas.0.id': 'invalid_format' },
    });
    expect(await bad([{ id: 'work', name: '  ' }])).toMatchObject({
      fields: { 'areas.0.name': 'too_small' },
    });
    expect(await bad([])).toMatchObject({ fields: { areas: 'too_small' } });
    expect((await ok('GET', PATH, { user: as })).version).toBe(1);
  });

  it('keeps stored Work and Personal rows as they were', async () => {
    const as = user('stored');
    const at = '2026-09-01T12:00:00.000Z';
    const noteId = ulid();
    const taskId = ulid();
    const note = buildNoteMetaItem({
      id: noteId,
      userId: as,
      area: 'personal',
      type: 'page',
      date: null,
      title: 'Groceries',
      bodyMarkdown: 'milk',
      tags: [],
      pinned: false,
      archived: false,
      taskIds: [],
      version: 3,
      createdAt: at,
      updatedAt: at,
      deleted: false,
    });
    const task = buildTaskMetaItem({
      id: taskId,
      userId: as,
      area: 'work',
      title: 'Ship it',
      description: '',
      priority: 'med',
      status: 'todo',
      dueDate: null,
      startDate: null,
      someday: false,
      completedAt: null,
      noteId: null,
      parentId: null,
      tags: [],
      version: 2,
      createdAt: at,
      updatedAt: at,
      deleted: false,
    });
    for (const Item of [note, task]) {
      await h.doc.send(new PutCommand({ TableName: h.tableName, Item }));
    }
    const before = {
      note: await ok('GET', `/api/notebook/notes/${noteId}`, { user: as }),
      task: await ok('GET', `/api/notebook/tasks/${taskId}`, { user: as }),
      template: await ok('GET', '/api/notebook/templates/daily/work', {
        user: as,
      }),
    };
    expect(before.note).toMatchObject({ area: 'personal', version: 3 });
    expect(before.task).toMatchObject({ area: 'work', version: 2 });
    expect(before.template.bodyMarkdown).toBe(DEFAULT_DAILY_TEMPLATES.work);

    await ok('PUT', PATH, {
      user: as,
      body: {
        version: 0,
        areas: [
          { id: 'personal', name: 'Home' },
          { id: 'work', name: 'Job' },
          { id: 'family', name: 'Family' },
        ],
      },
    });
    expect(
      await ok('GET', `/api/notebook/notes/${noteId}`, { user: as }),
    ).toEqual(before.note);
    expect(
      await ok('GET', `/api/notebook/tasks/${taskId}`, { user: as }),
    ).toEqual(before.task);
    expect(
      await ok('GET', '/api/notebook/templates/daily/work', { user: as }),
    ).toEqual(before.template);
    for (const [key, item] of [
      [keys.notebook.note.meta(as, noteId), note],
      [keys.notebook.task.meta(as, taskId), task],
    ] as const) {
      const stored = await h.doc.send(
        new GetCommand({ TableName: h.tableName, Key: key }),
      );
      expect(stored.Item).toEqual(item);
    }
  });
});
