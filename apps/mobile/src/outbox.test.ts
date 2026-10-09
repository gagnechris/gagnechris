import { createApiClient, type ApiClient } from '@gagnechris/api-client';
import { queryKeys, type Note, type Task } from '@gagnechris/app-core';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asyncStorage } from '../test/nativeFakes';
import { databases } from '../test/expoSqlite';
import { makeNote, notebookServer } from '../test/notebookServer';
import { wipeLocalData } from './cache';
import {
  activeOutbox,
  OUTBOX_DB_NAME,
  openOutboxDb,
  outboxFailedCount,
  outboxMiddleware,
  outboxPendingCount,
  startOutbox,
  stopOutbox,
} from './outbox';
import { pullSyncChanges } from './sync';
import {
  resetUpgradeRequired,
  setUpgradeRequired,
} from './sync/upgradeRequired';
import { hasLocalEdits } from './outbox/session';

vi.mock('@react-native-async-storage/async-storage', async () => ({
  default: (await import('../test/nativeFakes')).asyncStorage,
}));

const T1 = '01J00000000000000000000001';
const T2 = '01J00000000000000000000002';
const N2 = '01J0000000000000000000000N';

let server: ReturnType<typeof notebookServer>;
let queryClient: QueryClient;
let client: ApiClient;

const setOnline = (online: boolean) => {
  server.state.offline = !online;
  onlineManager.setOnline(online);
};

const open = async () => {
  await startOutbox({ db: openOutboxDb, client, queryClient });
  await activeOutbox()?.drain();
};

beforeEach(async () => {
  server = notebookServer([makeNote('n1', 'first')]);
  vi.stubGlobal('fetch', server.fetch);
  queryClient = new QueryClient();
  queryClient.setQueryData(
    queryKeys.notes.detail('n1'),
    server.state.store.get('n1'),
  );
  client = createApiClient({
    baseUrl: 'http://api.test',
    getToken: async () => 'local-ios:u1',
    before: [outboxMiddleware],
  });
  setOnline(true);
  await open();
});

afterEach(async () => {
  await stopOutbox();
  resetUpgradeRequired();
  databases.clear();
  asyncStorage.data.clear();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

const putNote = (id: string, body: Record<string, unknown>) =>
  client.PUT('/api/notebook/notes/{id}', {
    params: { path: { id } },
    body: body as { version: number },
  });

const postTask = (body: Record<string, unknown>) =>
  client.POST('/api/notebook/tasks', {
    body: body as { id: string; area: 'work'; title: string },
  });

/** As app-core does with every reply: the cache takes it. */
const cacheNote = (note: Note | undefined) =>
  queryClient.setQueryData(queryKeys.notes.detail(note!.id), note);
const cacheTask = (task: Task | undefined) =>
  queryClient.setQueryData(queryKeys.tasks.detail(task!.id), task);

describe('the outbox', () => {
  it('sends a write straight through while online', async () => {
    const { data, response } = await putNote('n1', {
      version: 1,
      bodyMarkdown: 'online',
    });
    expect(response.status).toBe(200);
    expect(data?.version).toBe(2);
    expect(server.state.store.get('n1')?.bodyMarkdown).toBe('online');
    expect(outboxPendingCount()).toBe(0);
  });

  it('keeps a day of offline edits through a relaunch and sends each once', async () => {
    setOnline(false);
    // A note edited twice: the second save joins the first.
    const first = await putNote('n1', { version: 1, bodyMarkdown: 'draft' });
    expect(first.data?.version).toBe(2);
    cacheNote(first.data);
    const second = await putNote('n1', {
      version: 2,
      bodyMarkdown: 'draft, finished',
    });
    expect(second.data).toMatchObject({
      version: 2,
      bodyMarkdown: 'draft, finished',
    });
    cacheNote(second.data);

    // A task in that note, then completed.
    const created = await postTask({
      id: T1,
      area: 'work',
      title: 'Call back',
      noteId: 'n1',
    });
    expect(created.response.status).toBe(201);
    cacheTask(created.data);
    const done = await client.POST('/api/notebook/tasks/{id}/complete', {
      params: { path: { id: T1 } },
      body: { version: 1 },
    });
    expect(done.data).toMatchObject({ status: 'done', version: 2 });
    cacheTask(done.data);

    // A new page, renamed before it ever left the phone.
    const page = await client.POST('/api/notebook/notes', {
      body: { id: N2, area: 'work', type: 'page', title: 'Plan' },
    });
    cacheNote(page.data);
    cacheNote((await putNote(N2, { version: 1, title: 'Plan B' })).data);

    // A task created and deleted offline never reaches the server.
    cacheTask((await postTask({ id: T2, area: 'work', title: 'Oops' })).data);
    await client.DELETE('/api/notebook/tasks/{id}', {
      params: { path: { id: T2 } },
      body: { version: 1 },
    });

    expect(outboxPendingCount()).toBe(4);
    expect(server.state.requests).toEqual([]);

    // The app is killed and relaunched, still offline.
    await stopOutbox();
    await open();
    expect(outboxPendingCount()).toBe(4);

    setOnline(true);
    await activeOutbox()!.drain();

    expect(outboxPendingCount()).toBe(0);
    expect(server.state.requests).toEqual([
      'PUT /api/notebook/notes/n1',
      'POST /api/notebook/tasks',
      `POST /api/notebook/tasks/${T1}/complete`,
      'POST /api/notebook/notes',
    ]);
    expect(server.state.store.get('n1')).toMatchObject({
      bodyMarkdown: 'draft, finished',
      version: 2,
    });
    expect(server.state.taskStore.get(T1)).toMatchObject({
      status: 'done',
      noteId: 'n1',
      version: 2,
    });
    expect(server.state.store.get(N2)?.title).toBe('Plan B');
    expect(server.state.taskStore.has(T2)).toBe(false);
    expect(
      queryClient.getQueryData<Note>(queryKeys.notes.detail('n1'))?.version,
    ).toBe(2);
  });

  it('counts a save whose reply was lost as saved when the retry finds it applied', async () => {
    server.state.loseNextResponse = true;
    const reply = await putNote('n1', { version: 1, bodyMarkdown: 'once' });
    // The send failed as far as the phone knows, so the caller got the local copy.
    expect(reply.data?.bodyMarkdown).toBe('once');
    expect(outboxPendingCount()).toBe(1);

    await activeOutbox()!.drain();
    expect(server.state.conflicts).toBe(1);
    expect(outboxPendingCount()).toBe(0);
    expect(outboxFailedCount()).toBe(0);
    expect(server.state.store.get('n1')?.version).toBe(2);
  });

  it('holds a refused write without blocking the others', async () => {
    setOnline(false);
    // Edited on another device meanwhile, so this base version is stale.
    server.editNote('n1', { title: 'Renamed on web' });
    await putNote('n1', { version: 1, bodyMarkdown: 'phone text' });
    await postTask({ id: T1, area: 'work', title: 'Independent' });

    setOnline(true);
    await activeOutbox()!.drain();
    expect(outboxFailedCount()).toBe(1);
    expect(outboxPendingCount()).toBe(0);
    expect(server.state.taskStore.has(T1)).toBe(true);
    expect(server.state.store.get('n1')?.bodyMarkdown).toBe('first');
  });

  it('keeps local edits when the change feed brings the server copy', async () => {
    await pullSyncChanges(client, queryClient, hasLocalEdits);
    setOnline(false);
    server.editNote('n1', { title: 'Renamed on web' });
    await putNote('n1', { version: 1, bodyMarkdown: 'phone text' }).then(
      ({ data }) => cacheNote(data),
    );
    server.state.offline = false;
    await pullSyncChanges(client, queryClient, hasLocalEdits);
    expect(
      queryClient.getQueryData<Note>(queryKeys.notes.detail('n1'))
        ?.bodyMarkdown,
    ).toBe('phone text');
  });

  it('holds writes once the server requires a newer app', async () => {
    setUpgradeRequired('2.0.0');
    const reply = await putNote('n1', { version: 1, bodyMarkdown: 'later' });
    expect(reply.data?.bodyMarkdown).toBe('later');
    await activeOutbox()!.drain();
    expect(server.state.requests).toEqual([]);
    expect(outboxPendingCount()).toBe(1);
  });

  it('deletes its database on sign-out', async () => {
    setOnline(false);
    await putNote('n1', { version: 1, bodyMarkdown: 'unsent' });
    expect(databases.has(OUTBOX_DB_NAME)).toBe(true);
    await wipeLocalData();
    expect(databases.has(OUTBOX_DB_NAME)).toBe(false);
    expect(outboxPendingCount()).toBe(0);
  });
});
