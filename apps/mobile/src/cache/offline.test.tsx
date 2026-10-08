import { createApiClient } from '@gagnechris/api-client';
import {
  AppApiProvider,
  clearPendingFlushes,
  noteResource,
  pendingFlushCount,
  queryKeys,
  useNotebookSearchQuery,
  useNotesQuery,
  useVersionedDocEditor,
  type Note,
  type SaveState,
} from '@gagnechris/app-core';
import {
  onlineManager,
  QueryClient,
  useQueryClient,
} from '@tanstack/react-query';
import { persistQueryClientSave } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appState, asyncStorage, netInfo } from '../../test/nativeFakes';
import { makeNote, notebookServer } from '../../test/notebookServer';
import {
  EDITOR_OFFLINE_MESSAGE,
  EditorOfflineNotice,
  NetworkStatus,
  OFFLINE_MESSAGE,
  nativeRetrySignals,
  startConnectivity,
} from '../net';
import {
  CACHE_SCHEMA_VERSION,
  CachedQueryProvider,
  cacheBuster,
  unsavedEditCount,
  wipeLocalData,
} from '.';
import { createCachePersister } from './persister';
import { CACHE_STORAGE_KEY } from './policy';

vi.mock('@react-native-async-storage/async-storage', async () => ({
  default: (await import('../../test/nativeFakes')).asyncStorage,
}));
vi.mock('@react-native-community/netinfo', async () => ({
  default: (await import('../../test/nativeFakes')).netInfo,
}));
vi.mock(
  'react-native',
  async () => (await import('../../test/nativeFakes')).reactNative,
);
vi.mock(
  'react-native-safe-area-context',
  async () => (await import('../../test/nativeFakes')).safeAreaContext,
);

const SUB = 'u1';

let server: ReturnType<typeof notebookServer>;
let stopConnectivity: () => void;
const mounted: ReactTestRenderer[] = [];

/** The radio and the requests go down together. */
const setConnected = (connected: boolean) => {
  server.state.offline = !connected;
  netInfo.setConnected(connected);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  server = notebookServer([makeNote('n1', 'first words')]);
  vi.stubGlobal('fetch', server.fetch);
  setConnected(true);
  stopConnectivity = startConnectivity();
});

afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => renderer.unmount());
  }
  clearPendingFlushes();
  stopConnectivity();
  onlineManager.setOnline(true);
  asyncStorage.data.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const getClient = () =>
  createApiClient({
    baseUrl: 'http://api.test',
    getToken: async () => `local-ios:${SUB}`,
  });

const App = ({
  sub = SUB,
  children,
}: {
  sub?: string;
  children: ReactNode;
}) => (
  <AppApiProvider getClient={getClient}>
    <CachedQueryProvider sub={sub}>
      <NetworkStatus />
      {children}
    </CachedQueryProvider>
  </AppApiProvider>
);

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const render = async (element: ReactNode) => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<>{element}</>);
  });
  mounted.push(renderer);
  await advance(10);
  return renderer;
};

const unmount = (renderer: ReactTestRenderer) => {
  mounted.splice(mounted.indexOf(renderer), 1);
  act(() => renderer.unmount());
};

const textOf = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');

const screenText = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAll((node) => node.type === ('Text' as never))
    .map(textOf)
    .join('\n');

const stored = () => asyncStorage.data.get(CACHE_STORAGE_KEY) ?? '';

const NotesScreen = () => {
  const list = useNotesQuery();
  const note = noteResource.useQuery({ id: 'n1' });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <Text>list: {items.map((n) => n.title).join(', ') || 'none'}</Text>
      <Text>note: {note.data?.bodyMarkdown ?? 'none'}</Text>
    </>
  );
};

const SearchProbe = () => {
  useNotebookSearchQuery({ q: 'secret term' });
  return null;
};

type Draft = { body: string };
type EditorHandle = {
  draft: Draft;
  dirty: boolean;
  saveState: SaveState;
  saveError: string | null;
  updateDraft: (update: (prev: Draft) => Draft) => void;
};

let editor!: EditorHandle;
const exposeEditor = (next: EditorHandle) => {
  editor = next;
};

const Editor = ({
  expose = exposeEditor,
}: {
  expose?: typeof exposeEditor;
}) => {
  const doc = useVersionedDocEditor<Note, Draft, { id: string }>({
    resource: noteResource,
    params: { id: 'n1' },
    initialDraft: { body: '' },
    toDraft: (note) => ({ body: note.bodyMarkdown }),
    getEntityId: (note) => note.id,
    toPayload: (draft) => ({ bodyMarkdown: draft.body }),
    conflictMessage: 'Changed elsewhere.',
    confirm: async () => true,
    retrySignals: nativeRetrySignals,
  });
  expose(doc);
  return <EditorOfflineNotice dirty={doc.dirty} />;
};

const syncOnline = async () => {
  const renderer = await render(
    <App>
      <NotesScreen />
      <SearchProbe />
    </App>,
  );
  expect(screenText(renderer)).toContain('note: first words');
  await advance(1_500);
  return renderer;
};

const edit = async (body: string) => {
  await act(async () => {
    editor.updateDraft(() => ({ body }));
  });
};

describe('cached reads', () => {
  it('opens the notes list and a note from the saved copy with no connection', async () => {
    unmount(await syncOnline());
    expect(stored()).toContain('first words');

    setConnected(false);
    server.state.calls = [];
    const offline = await render(
      <App>
        <NotesScreen />
      </App>,
    );

    const text = screenText(offline);
    expect(text).toContain('list: Note n1');
    expect(text).toContain('note: first words');
    expect(text).toContain(OFFLINE_MESSAGE);
    expect(server.state.calls).toEqual([]);
  });

  it('never writes search terms or results to disk', async () => {
    const renderer = await syncOnline();
    expect(server.state.requests).toContain('POST /api/notebook/search');
    unmount(renderer);
    expect(stored()).toContain('first words');
    expect(stored()).not.toContain('secret term');
    expect(stored()).not.toContain('"search"');
  });

  it.each([
    [
      'restores a cache saved under this schema and user',
      CACHE_SCHEMA_VERSION,
      SUB,
      true,
    ],
    [
      'discards a cache saved under an older schema version',
      CACHE_SCHEMA_VERSION - 1,
      SUB,
      false,
    ],
    [
      'discards a cache saved for another user',
      CACHE_SCHEMA_VERSION,
      'u2',
      false,
    ],
  ])('%s', async (_label, schemaVersion, sub, restores) => {
    const seeded = new QueryClient();
    seeded.setQueryData(
      queryKeys.notes.detail('n1'),
      makeNote('n1', 'saved words'),
    );
    await persistQueryClientSave({
      queryClient: seeded,
      persister: createCachePersister(asyncStorage),
      buster: cacheBuster(sub, schemaVersion),
    });
    expect(stored()).toContain('saved words');

    setConnected(false);
    const renderer = await render(
      <App>
        <NotesScreen />
      </App>,
    );

    expect(screenText(renderer)).toContain(
      restores ? 'note: saved words' : 'note: none',
    );
    expect(stored().includes('saved words')).toBe(restores);
  });
});

describe('saving while offline', () => {
  it('holds an offline edit and saves it exactly once on reconnect', async () => {
    const renderer = await render(
      <App>
        <Editor />
      </App>,
    );
    expect(editor.draft).toEqual({ body: 'first words' });

    setConnected(false);
    await edit('written offline');
    await advance(1_000);
    expect(server.state.calls).toContain('PUT /api/notebook/notes/n1');
    expect(screenText(renderer)).toContain(EDITOR_OFFLINE_MESSAGE);
    expect(server.state.store.get('n1')?.bodyMarkdown).toBe('first words');

    server.state.calls = [];
    setConnected(true);
    // Well inside the first 2 s backoff, so only the reconnect can save it.
    await advance(100);
    expect(server.state.store.get('n1')).toMatchObject({
      bodyMarkdown: 'written offline',
      version: 2,
    });
    expect(editor.saveState).toBe('saved');

    await advance(120_000);
    expect(server.state.calls.filter((call) => call.startsWith('PUT'))).toEqual(
      ['PUT /api/notebook/notes/n1'],
    );
    expect(server.state.writes).toBe(1);
    expect(server.state.conflicts).toBe(0);
    expect(editor.saveError).toBeNull();
    expect(screenText(renderer)).not.toContain(EDITOR_OFFLINE_MESSAGE);
  });

  it('counts an edit left in a closed editor until the reconnect saves it once', async () => {
    const shell = await render(
      <App>
        <Editor />
      </App>,
    );
    setConnected(false);
    await edit('left behind');
    await act(async () => {
      shell.update(<App>{null}</App>);
    });
    await advance(10);
    expect(pendingFlushCount()).toBe(1);
    expect(screenText(shell)).toContain('1 unsaved edit');

    setConnected(true);
    await advance(100);
    expect(server.state.store.get('n1')?.bodyMarkdown).toBe('left behind');
    expect(server.state.writes).toBe(1);
    expect(screenText(shell)).not.toContain('unsaved edit');

    await advance(120_000);
    expect(server.state.writes).toBe(1);
  });

  it('treats a save whose response was lost as saved once, with no conflict', async () => {
    await render(
      <App>
        <Editor />
      </App>,
    );
    server.state.loseNextResponse = true;
    await edit('sent once');
    await advance(1_000);
    expect(server.state.writes).toBe(1);
    expect(editor.saveState).toBe('error');

    setConnected(false);
    setConnected(true);
    await advance(100);

    expect(editor.saveState).toBe('saved');
    expect(editor.saveError).toBeNull();
    expect(server.state.writes).toBe(1);
    expect(server.state.store.get('n1')).toMatchObject({
      bodyMarkdown: 'sent once',
      version: 2,
    });
  });

  it('retries a held save when the app becomes active', async () => {
    await render(
      <App>
        <Editor />
      </App>,
    );
    server.state.offline = true;
    await edit('saved on return');
    await advance(1_000);
    expect(editor.saveState).toBe('error');

    server.state.offline = false;
    appState.emit('active');
    await advance(100);
    expect(server.state.store.get('n1')?.bodyMarkdown).toBe('saved on return');
  });
});

describe('sign-out', () => {
  it('leaves no Notebook data in AsyncStorage', async () => {
    let queryClient!: QueryClient;
    const exposeClient = (client: QueryClient) => {
      queryClient = client;
    };
    const Probe = ({ expose }: { expose: typeof exposeClient }) => {
      expose(useQueryClient());
      return null;
    };
    const renderer = await render(
      <App>
        <NotesScreen />
        <Editor />
        <Probe expose={exposeClient} />
      </App>,
    );
    await advance(1_500);
    await asyncStorage.setItem('notebook.area', 'work');
    expect(stored()).toContain('first words');

    setConnected(false);
    await edit('unsaved at sign-out');
    await act(async () => {
      renderer.update(
        <App>
          <Probe expose={exposeClient} />
        </App>,
      );
    });
    await advance(1_500);
    expect(unsavedEditCount()).toBe(1);

    // Lands inside the persister's throttle window, so a write is still
    // scheduled when the wipe runs.
    await act(async () => {
      queryClient.setQueryData(
        queryKeys.notes.detail('n1'),
        makeNote('n1', 'late cache write'),
      );
    });
    await act(async () => {
      await wipeLocalData();
    });
    await advance(5_000);

    expect([...asyncStorage.data.keys()]).toEqual([]);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(unsavedEditCount()).toBe(0);

    setConnected(true);
    await advance(120_000);
    expect(server.state.writes).toBe(0);
  });
});
