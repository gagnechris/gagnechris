import { NOTEBOOK_AREA_STORAGE_KEY } from '@gagnechris/shared';
import { ActionSheetIOS } from 'react-native';
import { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TasksScreen from '../app/(tabs)/tasks/index';
import TodayScreen from '../app/(tabs)/today/index';
import UpcomingScreen from '../app/(tabs)/upcoming/index';
import { makeTask, notebookServer } from '../test/notebookServer';
import {
  allText,
  byLabel,
  memoryStore,
  Providers,
  render,
  settle,
} from '../test/render';
import { readStoredArea } from './area';

const FAMILY = [
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
  { id: 'family', name: 'Family' },
];

const serve = (tasks: ReturnType<typeof makeTask>[] = []) => {
  const server = notebookServer([], tasks);
  server.state.areas = FAMILY;
  vi.stubGlobal('fetch', server.fetch);
  return server;
};

const chooseFromSheet = async (index: number) => {
  const [options, choose] = vi.mocked(ActionSheetIOS.showActionSheetWithOptions)
    .mock.lastCall!;
  await act(async () => choose(index));
  return options.options;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('area switch', () => {
  it('reads the stored area, or nothing when storage fails', async () => {
    expect(await readStoredArea(memoryStore().store)).toBeNull();
    expect(
      await readStoredArea(
        memoryStore({ [NOTEBOOK_AREA_STORAGE_KEY]: 'family' }).store,
      ),
    ).toBe('family');
    const throwing = {
      getItem: async () => {
        throw new Error('locked');
      },
      setItem: async () => {},
    };
    expect(await readStoredArea(throwing)).toBeNull();
  });

  it('a stored area that is not one of mine, like All, opens the first area', async () => {
    serve();
    const { store } = memoryStore({ [NOTEBOOK_AREA_STORAGE_KEY]: 'all' });
    const renderer = await render(
      <Providers store={store}>
        <UpcomingScreen />
      </Providers>,
    );
    await settle(10);
    act(() => byLabel(renderer, 'Area: Work').props.onPress());
    expect(await chooseFromSheet(3)).toEqual([
      'Work',
      'Personal',
      'Family',
      'Cancel',
    ]);
    renderer.unmount();
  });

  it('keeps the chosen area across a relaunch', async () => {
    serve();
    const { store, data } = memoryStore();
    const first = await render(
      <Providers store={store}>
        <UpcomingScreen />
      </Providers>,
    );
    await settle(10);
    act(() => byLabel(first, 'Area: Work').props.onPress());
    await chooseFromSheet(2);
    expect(data.get(NOTEBOOK_AREA_STORAGE_KEY)).toBe('family');
    expect(byLabel(first, 'Area: Family')).toBeDefined();
    first.unmount();

    const relaunched = await render(
      <Providers store={store}>
        <UpcomingScreen />
      </Providers>,
    );
    await settle(10);
    expect(byLabel(relaunched, 'Area: Family')).toBeDefined();
    relaunched.unmount();
  });

  it('the Today chip offers my areas and no All', async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
    serve();
    const renderer = await render(
      <Providers>
        <TodayScreen />
      </Providers>,
    );
    await settle(10);
    act(() => byLabel(renderer, 'Area: Work').props.onPress());
    const [options, choose] = vi.mocked(
      ActionSheetIOS.showActionSheetWithOptions,
    ).mock.lastCall!;
    expect(options.options).toEqual(['Work', 'Personal', 'Family', 'Cancel']);
    await act(async () => choose(2));
    await settle(10);
    expect(byLabel(renderer, 'Area: Family')).toBeDefined();
    renderer.unmount();
  });

  it('the task list spans every area with its name; picking one narrows it and quick add files there', async () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
    const server = serve([
      makeTask('01HTASKAAAAAAAAAAAAAAAAAAA', 'Standup'),
      makeTask('01HTASKBBBBBBBBBBBBBBBBBBB', 'Dentist', { area: 'family' }),
    ]);
    const renderer = await render(
      <Providers>
        <TasksScreen />
      </Providers>,
    );
    await settle(15);
    expect(byLabel(renderer, 'Standup, Work')).toBeDefined();
    expect(byLabel(renderer, 'Dentist, Family')).toBeDefined();

    act(() => byLabel(renderer, 'Area: All areas').props.onPress());
    expect(await chooseFromSheet(3)).toEqual([
      'All areas',
      'Work',
      'Personal',
      'Family',
      'Cancel',
    ]);
    await settle(15);
    expect(byLabel(renderer, 'Area: Family')).toBeDefined();
    expect(allText(renderer)).toContain('Dentist');
    expect(allText(renderer)).not.toContain('Standup');

    const field = renderer.root.find(
      (node) =>
        (node.type as string) === 'TextInput' &&
        node.props.accessibilityLabel === 'Quick add task',
    );
    act(() => field.props.onChangeText('Pack lunches'));
    await act(async () => byLabel(renderer, 'Add').props.onPress());
    await settle(15);
    expect(
      [...server.state.taskStore.values()].find(
        (t) => t.title === 'Pack lunches',
      )?.area,
    ).toBe('family');
    renderer.unmount();
  });
});
