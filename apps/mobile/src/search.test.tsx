import { NOTEBOOK_AREA_STORAGE_KEY } from '@gagnechris/shared';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SearchScreen from '../app/search';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { router } from '../test/router';
import {
  allText,
  byLabel,
  memoryStore,
  Providers,
  render,
  settle,
} from '../test/render';
import { RECENT_SEARCHES_KEY } from './notebook/recentSearches';

const TASK = '01HTASKAAAAAAAAAAAAAAAAAAA';
let mounted: ReactTestRenderer[] = [];

afterEach(() => {
  act(() => mounted.forEach((renderer) => renderer.unmount()));
  mounted = [];
  vi.clearAllMocks();
});

const notes = [
  ...Array.from({ length: 120 }, (_, i) =>
    makeNote(`01FILLER${String(i).padStart(18, '0')}`, `Filler ${i}`),
  ),
  makeNote('01PASSPORTNOTE000000000000', `Trip prep\n{{task:${TASK}}}\n`, {
    title: 'Travel',
  }),
  makeNote('01PERSONALNOTE000000000000', 'Passport photos at the pharmacy', {
    title: 'Errands',
    area: 'personal',
  }),
];
const tasks = [makeTask(TASK, 'Renew passport')];

const launch = async (store = memoryStore().store) => {
  const server = notebookServer(notes, tasks);
  vi.stubGlobal('fetch', server.fetch);
  const renderer = await render(
    <Providers store={store}>
      <SearchScreen />
    </Providers>,
  );
  mounted.push(renderer);
  await settle();
  return renderer;
};

const type = async (renderer: ReactTestRenderer, q: string) => {
  act(() => byLabel(renderer, 'Search notes and tasks').props.onChangeText(q));
  await vi.waitFor(
    () => expect(allText(renderer)).not.toContain('Searching…'),
    { timeout: 2_000 },
  );
  await settle();
};

const hits = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAll(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props.accessibilityHint === 'string' &&
        node.props.accessibilityHint.startsWith('Opens the'),
    )
    .map((node) => node.props.accessibilityLabel as string);

describe('Search', () => {
  it('finds notes and tasks by title and body, past the first page of notes', async () => {
    const renderer = await launch();
    await type(renderer, 'passport');
    expect(hits(renderer)).toEqual([
      'Travel, Trip prep - [ ] Renew passport',
      'Renew passport, Renew passport',
    ]);
    expect(allText(renderer)).toContain('NOTES');
    expect(allText(renderer)).toContain('TASKS');
  });

  it('never shows an embed token', async () => {
    const renderer = await launch();
    await type(renderer, 'trip');
    expect(allText(renderer)).toContain('Renew passport');
    expect(allText(renderer)).not.toContain('{{task:');
  });

  it('searches every area with All areas', async () => {
    const renderer = await launch();
    await type(renderer, 'pharmacy');
    expect(allText(renderer)).toContain('No notes or tasks match.');
    await act(async () => byLabel(renderer, 'All areas').props.onPress());
    await type(renderer, 'pharmacy');
    expect(hits(renderer)).toEqual([
      'Errands · Personal, Passport photos at the pharmacy',
    ]);
  });

  it('opens a hit and remembers the search on this device', async () => {
    const { store, data } = memoryStore({
      [NOTEBOOK_AREA_STORAGE_KEY]: 'work',
    });
    const renderer = await launch(store);
    await type(renderer, 'passport');
    const task = renderer.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityHint === 'Opens the task',
    );
    act(() => task.props.onPress());
    expect(router.back).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith(`/tasks/${TASK}`);
    expect(JSON.parse(data.get(RECENT_SEARCHES_KEY)!)).toEqual(['passport']);

    const again = await launch(store);
    expect(byLabel(again, 'Search for passport')).toBeDefined();
    act(() => byLabel(again, 'Search for passport').props.onPress());
    expect(byLabel(again, 'Search notes and tasks').props.value).toBe(
      'passport',
    );

    act(() => byLabel(again, 'Search notes and tasks').props.onChangeText(''));
    await act(async () =>
      byLabel(again, 'Clear recent searches').props.onPress(),
    );
    expect(JSON.parse(data.get(RECENT_SEARCHES_KEY)!)).toEqual([]);
  });

  it('completes a task from its hit', async () => {
    const server = notebookServer(notes, tasks);
    const renderer = await launch();
    vi.stubGlobal('fetch', server.fetch);
    await type(renderer, 'renew');
    await act(async () =>
      byLabel(renderer, 'Complete Renew passport').props.onPress(),
    );
    await settle(10);
    expect(server.state.taskStore.get(TASK)!.status).toBe('done');
    expect(byLabel(renderer, 'Reopen Renew passport')).toBeDefined();
  });
});
