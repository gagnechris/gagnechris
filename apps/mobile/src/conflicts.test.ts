import { createApiClient, type ApiClient } from '@gagnechris/api-client';
import { queryKeys, type Note, type Task } from '@gagnechris/app-core';
import { taskEmbedToken } from '@gagnechris/shared';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asyncStorage } from '../test/nativeFakes';
import { databases } from '../test/expoSqlite';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import {
  activeOutbox,
  openOutboxDb,
  outboxConflicts,
  outboxFailedCount,
  outboxMiddleware,
  outboxPendingCount,
  resolveConflict,
  startOutbox,
  stopOutbox,
} from './outbox';

vi.mock('@react-native-async-storage/async-storage', async () => ({
  default: (await import('../test/nativeFakes')).asyncStorage,
}));

const T1 = '01J00000000000000000000001';
const T2 = '01J00000000000000000000002';
const DAY = '2026-10-02';
const PHONE_DAY = '01J0000000000000000000PHDY';
const WEB_DAY = '01J0000000000000000000WBDY';

let server: ReturnType<typeof notebookServer>;
let queryClient: QueryClient;
let client: ApiClient;

const setOnline = (online: boolean) => {
  server.state.offline = !online;
  onlineManager.setOnline(online);
};

const sync = async () => {
  setOnline(true);
  await activeOutbox()!.drain();
};

const launch = async (notes: Note[], tasks: Task[] = []) => {
  server = notebookServer(notes, tasks);
  vi.stubGlobal('fetch', server.fetch);
  queryClient = new QueryClient();
  for (const note of notes)
    queryClient.setQueryData(queryKeys.notes.detail(note.id), note);
  for (const task of tasks)
    queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
  client = createApiClient({
    baseUrl: 'http://api.test',
    getToken: async () => 'local-ios:u1',
    before: [outboxMiddleware],
  });
  setOnline(true);
  await startOutbox({ db: openOutboxDb, client, queryClient });
  await activeOutbox()!.drain();
};

afterEach(async () => {
  await stopOutbox();
  databases.clear();
  asyncStorage.data.clear();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

/** As app-core does with every reply: the cache takes it. */
const cache = <T extends Note | Task>(entity: T | undefined) => {
  const keys = 'type' in entity! ? queryKeys.notes : queryKeys.tasks;
  queryClient.setQueryData(keys.detail(entity!.id), entity);
  return entity!;
};

const putNote = async (id: string, body: Record<string, unknown>) =>
  cache(
    (
      await client.PUT('/api/notebook/notes/{id}', {
        params: { path: { id } },
        body: body as { version: number },
      })
    ).data as Note,
  );

const putTask = async (id: string, body: Record<string, unknown>) =>
  cache(
    (
      await client.PUT('/api/notebook/tasks/{id}', {
        params: { path: { id } },
        body: body as { version: number },
      })
    ).data as Task,
  );

const cachedNote = (id: string) =>
  queryClient.getQueryData<Note>(queryKeys.notes.detail(id));
const cachedTask = (id: string) =>
  queryClient.getQueryData<Task>(queryKeys.tasks.detail(id));

describe('task conflicts', () => {
  beforeEach(() => launch([], [makeTask(T1, 'Call back')]));

  it('merges fields that only one side changed', async () => {
    setOnline(false);
    server.editTask(T1, { priority: 'high' });
    await putTask(T1, { version: 1, title: 'Call back Sam' });
    await sync();
    expect(server.state.taskStore.get(T1)).toMatchObject({
      title: 'Call back Sam',
      priority: 'high',
      version: 3,
    });
    expect(cachedTask(T1)).toMatchObject({ priority: 'high', version: 3 });
    expect(outboxFailedCount()).toBe(0);
  });

  it('completes a task another device edited meanwhile', async () => {
    setOnline(false);
    server.editTask(T1, { title: 'Call back today' });
    cache(
      (
        await client.POST('/api/notebook/tasks/{id}/complete', {
          params: { path: { id: T1 } },
          body: { version: 1 },
        })
      ).data as Task,
    );
    await sync();
    expect(server.state.taskStore.get(T1)).toMatchObject({
      title: 'Call back today',
      status: 'done',
    });
  });

  it('asks about a field both sides changed, then keeps the phone’s', async () => {
    setOnline(false);
    server.editTask(T1, { title: 'Web title', priority: 'low' });
    await putTask(T1, { version: 1, title: 'Phone title' });
    await putTask(T1, { version: 2, description: 'More' });
    await sync();
    expect(outboxConflicts()).toEqual([
      expect.objectContaining({
        entityId: T1,
        kind: 'changed',
        fields: ['title'],
        server: expect.objectContaining({ title: 'Web title' }),
      }),
    ]);
    // Parked edits stay on the phone until the user picks.
    expect(cachedTask(T1)?.title).toBe('Phone title');

    await resolveConflict(T1, 'mine');
    await activeOutbox()!.drain();
    expect(outboxConflicts()).toEqual([]);
    expect(outboxPendingCount()).toBe(0);
    expect(server.state.taskStore.get(T1)).toMatchObject({
      title: 'Phone title',
      description: 'More',
      priority: 'low',
    });
  });

  it('keeps the other device’s version', async () => {
    setOnline(false);
    server.editTask(T1, { title: 'Web title' });
    await putTask(T1, { version: 1, title: 'Phone title' });
    await putTask(T1, { version: 2, description: 'More' });
    await sync();

    await resolveConflict(T1, 'theirs');
    expect(outboxPendingCount() + outboxFailedCount()).toBe(0);
    expect(cachedTask(T1)).toMatchObject({ title: 'Web title', version: 2 });
    expect(server.state.taskStore.get(T1)?.description).toBe('');
  });

  it('restores a task deleted elsewhere as a new one', async () => {
    setOnline(false);
    server.deleteTask(T1);
    await putTask(T1, { version: 1, title: 'Still needed' });
    await sync();
    expect(outboxConflicts()[0]?.kind).toBe('deleted');

    const id = await resolveConflict(T1, 'restore');
    await activeOutbox()!.drain();
    expect(id).not.toBe(T1);
    expect(server.state.taskStore.get(id!)).toMatchObject({
      title: 'Still needed',
      deleted: false,
    });
    expect(cachedTask(T1)?.deleted).toBe(true);
    expect(outboxConflicts()).toEqual([]);
  });
});

describe('note conflicts', () => {
  beforeEach(() => launch([makeNote('n1', 'shared text')]));

  it('merges a body edit with a rename elsewhere', async () => {
    setOnline(false);
    server.editNote('n1', { title: 'Renamed on web' });
    await putNote('n1', { version: 1, bodyMarkdown: 'phone text' });
    await sync();
    expect(server.state.store.get('n1')).toMatchObject({
      title: 'Renamed on web',
      bodyMarkdown: 'phone text',
    });
  });

  it('saves the phone’s text as a new page and keeps theirs', async () => {
    setOnline(false);
    server.editNote('n1', { bodyMarkdown: 'web text' });
    await putNote('n1', { version: 1, bodyMarkdown: 'phone text' });
    await sync();
    expect(outboxConflicts()[0]).toMatchObject({
      kind: 'changed',
      fields: ['bodyMarkdown'],
    });

    const id = await resolveConflict('n1', 'copy');
    await activeOutbox()!.drain();
    expect(server.state.store.get(id!)).toMatchObject({
      type: 'page',
      title: 'Note n1',
      bodyMarkdown: 'phone text',
    });
    expect(server.state.store.get('n1')?.bodyMarkdown).toBe('web text');
    expect(cachedNote('n1')?.bodyMarkdown).toBe('web text');
    expect(outboxConflicts()).toEqual([]);
  });

  it('keeps a conflict through a relaunch', async () => {
    setOnline(false);
    server.editNote('n1', { bodyMarkdown: 'web text' });
    await putNote('n1', { version: 1, bodyMarkdown: 'phone text' });
    await sync();
    await stopOutbox();
    await startOutbox({ db: openOutboxDb, client, queryClient });
    expect(outboxConflicts()).toEqual([
      expect.objectContaining({ entityId: 'n1', kind: 'changed' }),
    ]);
  });

  it('lets a refused change be discarded', async () => {
    server.state.refuseWrites = {
      status: 400,
      body: { error: 'validation', message: 'Too long' },
    };
    setOnline(false);
    await putNote('n1', { version: 1, title: 'x'.repeat(10) });
    await sync();
    expect(outboxConflicts()).toEqual([
      expect.objectContaining({ kind: 'refused', message: 'Too long' }),
    ]);
    await resolveConflict('n1', 'discard');
    expect(outboxFailedCount()).toBe(0);
  });
});

describe('a daily note started on two devices', () => {
  const placeholder = {
    id: PHONE_DAY,
    userId: 'u1',
    area: 'work',
    type: 'daily',
    date: DAY,
    title: '',
    bodyMarkdown: '',
    tags: [],
    pinned: false,
    taskIds: [],
    version: 0,
    createdAt: '',
    updatedAt: '',
    deleted: false,
  } satisfies Note;

  const writeDay = async (bodyMarkdown: string) =>
    cache(
      (
        await client.PUT('/api/notebook/notes/daily/{area}/{date}', {
          params: { path: { area: 'work', date: DAY } },
          body: { id: PHONE_DAY, bodyMarkdown } as never,
        })
      ).data as Note,
    );

  beforeEach(async () => {
    await launch([]);
    queryClient.setQueryData(queryKeys.notes.daily('work', DAY), placeholder);
    setOnline(false);
    server.state.store.set(
      WEB_DAY,
      makeNote(WEB_DAY, `From the laptop\n\n${taskEmbedToken(T1)}\n`, {
        type: 'daily',
        date: DAY,
        title: '',
      }),
    );
  });

  it('takes the other device’s note when nothing was typed', async () => {
    await writeDay('  ');
    await sync();
    expect(outboxConflicts()).toEqual([]);
    expect(
      queryClient.getQueryData<Note>(queryKeys.notes.daily('work', DAY))?.id,
    ).toBe(WEB_DAY);
  });

  it('merges the phone’s text under theirs and moves its tasks', async () => {
    await writeDay(`From the phone\n\n${taskEmbedToken(T1)}\n`);
    // One task created in the losing note while offline, one already on the server.
    server.state.offline = false;
    server.state.taskStore.set(T2, makeTask(T2, 'Sent', { noteId: PHONE_DAY }));
    cache(makeTask(T2, 'Sent', { noteId: PHONE_DAY }));
    server.state.offline = true;
    cache(
      (
        await client.POST('/api/notebook/tasks', {
          body: { id: T1, area: 'work', title: 'Queued', noteId: PHONE_DAY },
        })
      ).data as Task,
    );
    await sync();
    expect(outboxConflicts()).toEqual([
      expect.objectContaining({ entityId: PHONE_DAY, kind: 'daily_taken' }),
    ]);
    // The task create waits on the note it names.
    expect(server.state.taskStore.has(T1)).toBe(false);

    await resolveConflict(PHONE_DAY, 'merge');
    await activeOutbox()!.drain();
    expect(server.state.store.get(WEB_DAY)?.bodyMarkdown).toBe(
      'From the laptop\n\n' + `${taskEmbedToken(T1)}\n\nFrom the phone\n`,
    );
    expect(server.state.store.has(PHONE_DAY)).toBe(false);
    expect(server.state.taskStore.get(T1)?.noteId).toBe(WEB_DAY);
    expect(server.state.taskStore.get(T2)?.noteId).toBe(WEB_DAY);
    expect(
      queryClient.getQueryData<Note>(queryKeys.notes.daily('work', DAY))?.id,
    ).toBe(WEB_DAY);
    expect(outboxPendingCount() + outboxFailedCount()).toBe(0);
  });

  it('uses the saved note when asked', async () => {
    await writeDay('From the phone');
    await sync();
    await resolveConflict(PHONE_DAY, 'saved');
    await activeOutbox()!.drain();
    expect(server.state.store.get(WEB_DAY)?.bodyMarkdown).toBe(
      `From the laptop\n\n${taskEmbedToken(T1)}\n`,
    );
    expect(
      queryClient.getQueryData<Note>(queryKeys.notes.daily('work', DAY))?.id,
    ).toBe(WEB_DAY);
  });
});
