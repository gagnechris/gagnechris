import { createApiClient } from '@gagnechris/api-client';
import {
  AppApiProvider,
  queryKeys,
  type Note,
  type Task,
} from '@gagnechris/app-core';
import { CLIENT_VERSION_HEADER } from '@gagnechris/shared';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appState, asyncStorage, netInfo } from '../test/nativeFakes';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { CachedQueryProvider } from './cache';
import { NetworkStatus, startConnectivity, upgradeMessage } from './net';
import {
  CLIENT_VERSION,
  pullSyncChanges,
  resetUpgradeRequired,
  sendClientVersion,
  syncWatermarkKey,
  UpgradeRequiredError,
  useSyncFeed,
} from './sync';

vi.mock('@react-native-async-storage/async-storage', async () => ({
  default: (await import('../test/nativeFakes')).asyncStorage,
}));
vi.mock('@react-native-community/netinfo', async () => ({
  default: (await import('../test/nativeFakes')).netInfo,
}));
vi.mock(
  'react-native',
  async () => (await import('../test/nativeFakes')).reactNative,
);
vi.mock(
  'react-native-safe-area-context',
  async () => (await import('../test/nativeFakes')).safeAreaContext,
);

let server: ReturnType<typeof notebookServer>;
const mounted: ReactTestRenderer[] = [];

const client = () =>
  sendClientVersion(
    createApiClient({
      baseUrl: 'http://api.test',
      getToken: async () => 'local-ios:u1',
    }),
  );

type Paged<T> = { pages: { items: T[] }[]; pageParams: unknown[] };

const paged = <T,>(items: T[]): Paged<T> => ({
  pages: [{ items }],
  pageParams: [undefined],
});

const listIds = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient
    .getQueryData<Paged<{ id: string }>>(key)
    ?.pages.flatMap((page) => page.items.map((item) => item.id));

const T1 = '01J00000000000000000000001';
const T2 = '01J00000000000000000000002';
const T3 = '01J00000000000000000000003';

const tasksKey = queryKeys.tasks.list({ area: 'work', open: true });
const notesKey = queryKeys.notes.list({ area: 'work' });

beforeEach(() => {
  server = notebookServer(
    [makeNote('n1', 'first'), makeNote('n2', 'second')],
    [makeTask(T1, 'Write tests'), makeTask(T2, 'Ship it')],
  );
  vi.stubGlobal('fetch', server.fetch);
});

afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => renderer.unmount());
  }
  resetUpgradeRequired();
  onlineManager.setOnline(true);
  asyncStorage.data.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A phone that has opened n1 and the work task list. */
const seeded = () => {
  const queryClient = new QueryClient();
  const [n1] = [...server.state.store.values()];
  queryClient.setQueryData(queryKeys.notes.detail('n1'), n1);
  queryClient.setQueryData(notesKey, paged([...server.state.store.values()]));
  queryClient.setQueryData(
    tasksKey,
    paged([...server.state.taskStore.values()]),
  );
  return queryClient;
};

describe('the change feed', () => {
  it('sends the app version on every request', async () => {
    await pullSyncChanges(client(), new QueryClient());
    expect(server.state.clientVersions).not.toHaveLength(0);
    expect(new Set(server.state.clientVersions)).toEqual(
      new Set([CLIENT_VERSION]),
    );
    expect(CLIENT_VERSION_HEADER).toBe('x-gagnechris-client-version');
  });

  it('applies edits from another device to cached details and lists', async () => {
    const queryClient = seeded();
    await pullSyncChanges(client(), queryClient);
    const watermark = queryClient.getQueryData<string>(syncWatermarkKey);
    expect(watermark).toBeDefined();

    server.editNote('n1', { bodyMarkdown: 'edited on web' });
    server.editTask(T1, { status: 'done' });
    const created = makeTask(T3, 'Made on web', {
      updatedAt: '2026-10-03T00:00:00.000Z',
    });
    server.state.taskStore.set(T3, created);
    await pullSyncChanges(client(), queryClient);

    expect(
      queryClient.getQueryData<Note>(queryKeys.notes.detail('n1'))
        ?.bodyMarkdown,
    ).toBe('edited on web');
    // Done leaves the open list; the new open task joins it.
    expect(listIds(queryClient, tasksKey)).toEqual([T3, T2]);
    expect(server.state.calls.at(-1)).toBe('GET /api/notebook/sync/changes');
    expect(queryClient.getQueryData(syncWatermarkKey)).not.toBe(watermark);
  });

  it('never caches details the phone has not opened', async () => {
    const queryClient = seeded();
    await pullSyncChanges(client(), queryClient);
    server.editNote('n2', { bodyMarkdown: 'edited on web' });
    await pullSyncChanges(client(), queryClient);
    expect(
      queryClient.getQueryData(queryKeys.notes.detail('n2')),
    ).toBeUndefined();
    expect(
      queryClient
        .getQueryData<Paged<Note>>(notesKey)
        ?.pages[0]!.items.find((note) => note.id === 'n2')?.bodyMarkdown,
    ).toBe('edited on web');
  });

  it('ignores a change it already has, so the overlap window is harmless', async () => {
    const queryClient = seeded();
    await pullSyncChanges(client(), queryClient);
    const local = { ...server.state.store.get('n1')!, version: 5 };
    queryClient.setQueryData(queryKeys.notes.detail('n1'), local);
    server.editNote('n1', { bodyMarkdown: 'older' });
    await pullSyncChanges(client(), queryClient);
    expect(
      queryClient.getQueryData<Note>(queryKeys.notes.detail('n1')),
    ).toEqual(local);
  });

  it('removes what another device deleted', async () => {
    const queryClient = seeded();
    await pullSyncChanges(client(), queryClient);
    server.editTask(T2, { deleted: true });
    server.editNote('n1', { deleted: true });
    await pullSyncChanges(client(), queryClient);
    expect(listIds(queryClient, tasksKey)).toEqual([T1]);
    expect(listIds(queryClient, notesKey)).toEqual(['n2']);
    expect(
      queryClient.getQueryData<Note>(queryKeys.notes.detail('n1'))?.deleted,
    ).toBe(true);
  });

  it('rebuilds from the full feed after a 410 and drops what the server no longer has', async () => {
    const queryClient = seeded();
    await pullSyncChanges(client(), queryClient);
    // Purged past the tombstone horizon: absent from every feed.
    server.state.taskStore.delete(T2);
    server.state.store.delete('n1');
    server.editTask(T1, { title: 'Write more tests' });
    server.state.resyncBefore = '2999-01-01T00:00:00.000Z';
    await pullSyncChanges(client(), queryClient);

    expect(listIds(queryClient, tasksKey)).toEqual([T1]);
    expect(
      queryClient.getQueryData<Paged<Task>>(tasksKey)?.pages[0]!.items[0]!
        .title,
    ).toBe('Write more tests');
    expect(listIds(queryClient, notesKey)).toEqual(['n2']);
    expect(
      queryClient.getQueryData(queryKeys.notes.detail('n1')),
    ).toBeUndefined();
    const sinces = server.state.calls.filter((call) =>
      call.startsWith('GET /api/notebook/sync/changes'),
    );
    expect(sinces).toHaveLength(3);
  });

  it('stops on a 426', async () => {
    server.state.minClientVersion = '99.0.0';
    await expect(
      pullSyncChanges(client(), new QueryClient()),
    ).rejects.toBeInstanceOf(UpgradeRequiredError);
  });
});

describe('polling', () => {
  let stopConnectivity: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    netInfo.setConnected(true);
    stopConnectivity = startConnectivity();
  });

  afterEach(() => {
    stopConnectivity();
  });

  const Sync = () => {
    useSyncFeed();
    return null;
  };

  const advance = async (ms = 10) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  const render = async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AppApiProvider getClient={client}>
          <CachedQueryProvider sub="u1">
            <NetworkStatus />
            <Sync />
          </CachedQueryProvider>
        </AppApiProvider>,
      );
    });
    mounted.push(renderer);
    await advance();
    return renderer;
  };

  const pulls = () =>
    server.state.requests.filter(
      (call) => call === 'GET /api/notebook/sync/changes',
    ).length;

  it('pulls on launch, on returning to the foreground and on reconnecting', async () => {
    await render();
    expect(pulls()).toBe(1);

    await act(async () => appState.emit('active'));
    await advance();
    expect(pulls()).toBe(2);

    server.state.offline = true;
    netInfo.setConnected(false);
    await advance();
    server.state.offline = false;
    await act(async () => netInfo.setConnected(true));
    await advance();
    expect(pulls()).toBe(3);
  });

  it('shows the update banner after a 426 and stops polling', async () => {
    server.state.minClientVersion = '99.0.0';
    const renderer = await render();
    expect(
      renderer.root.findByProps({ testID: 'upgrade-required' }).props.children,
    ).toBe(upgradeMessage('99.0.0'));

    await act(async () => appState.emit('active'));
    await advance();
    expect(pulls()).toBe(1);
  });
});
