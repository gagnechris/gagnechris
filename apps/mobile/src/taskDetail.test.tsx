import { clearPendingFlushes } from '@gagnechris/app-core';
import * as Haptics from 'expo-haptics';
import { ActionSheetIOS, Alert, View } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskScreen from '../app/(tabs)/tasks/[id]';
import TodayScreen from '../app/(tabs)/today/index';
import UpcomingScreen from '../app/(tabs)/upcoming/index';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { router, searchParams } from '../test/router';
import { allText, byLabel, Providers, render, settle } from '../test/render';

const A = '01HTASKAAAAAAAAAAAAAAAAAAA';
const HOME = '01HOMENOTE0000000000000000';
const LATER = '01LATERNOTE000000000000000';
const OTHER = '01OTHERNOTE000000000000000';

let server: ReturnType<typeof notebookServer>;
let mounted: ReactTestRenderer[] = [];

const serve = (...args: Parameters<typeof notebookServer>) => {
  server = notebookServer(...args);
  vi.stubGlobal('fetch', server.fetch);
};

beforeEach(() => {
  // Friday, Oct 2.
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
  searchParams.current = { id: A };
});

afterEach(() => {
  act(() => mounted.forEach((renderer) => renderer.unmount()));
  mounted = [];
  clearPendingFlushes();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const launch = async (...screens: (() => React.JSX.Element)[]) => {
  const renderer = await render(
    <Providers>
      {screens.map((Screen, i) => (
        <View key={i}>
          <Screen />
        </View>
      ))}
    </Providers>,
  );
  mounted.push(renderer);
  await settle(15);
  return renderer;
};

const sheet = () =>
  vi.mocked(ActionSheetIOS.showActionSheetWithOptions).mock.lastCall!;

/** Opens a field's sheet and picks the option starting with `option`. */
const pick = async (
  renderer: ReactTestRenderer,
  field: string,
  option: string,
) => {
  act(() =>
    renderer.root
      .find(
        (node) =>
          typeof node.type === 'string' &&
          typeof node.props.accessibilityLabel === 'string' &&
          node.props.accessibilityLabel.startsWith(`${field}, `) &&
          node.props.onPress,
      )
      .props.onPress(),
  );
  const [options, choose] = sheet();
  const index = options.options.findIndex((o) => o.startsWith(option));
  expect(index).toBeGreaterThanOrEqual(0);
  await act(async () => choose(index));
  await settle(10);
};

const banner = (renderer: ReactTestRenderer) =>
  renderer.root.find(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.endsWith('Show list'),
  ).props.accessibilityLabel as string;

describe('Task detail', () => {
  it('moves the task between Today, Coming up and Upcoming as Shows on changes', async () => {
    serve([], [makeTask(A, 'Call Sam')]);
    const renderer = await launch(TaskScreen, TodayScreen, UpcomingScreen);
    expect(banner(renderer)).toBe('1 still open, 0 coming up. Show list');

    await pick(renderer, 'Shows on', 'Tomorrow');
    expect(server.state.taskStore.get(A)!.startDate).toBe('2026-10-03');
    expect(banner(renderer)).toBe('0 still open, 1 coming up. Show list');
    expect(allText(renderer)).toContain('TOMORROW');

    await pick(renderer, 'Shows on', 'Someday');
    expect(server.state.taskStore.get(A)).toMatchObject({
      startDate: null,
      someday: true,
    });
    expect(banner(renderer)).toBe('0 still open, 0 coming up. Show list');
    expect(allText(renderer)).toContain('SOMEDAY');

    await pick(renderer, 'Shows on', 'Today');
    expect(banner(renderer)).toBe('1 still open, 0 coming up. Show list');
  });

  it('lists every note that embeds the task, home note first, and opens it', async () => {
    serve(
      [
        makeNote(OTHER, 'Nothing here'),
        makeNote(LATER, `{{task:${A}}}\nCalled, left a message`, {
          type: 'daily',
          date: '2026-10-02',
          title: '',
          area: 'personal',
        }),
        makeNote(HOME, `{{task:${A}}}`, { title: 'Planning' }),
      ],
      [makeTask(A, 'Call Sam', { noteId: HOME })],
    );
    const renderer = await launch(TaskScreen);
    const rows = renderer.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityHint === 'Opens the note',
    );
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'Planning (created here), Thu',
      'Friday, Oct 2, Called, left a message',
    ]);
    act(() => rows[1]!.props.onPress());
    expect(router.push).toHaveBeenCalledWith(`/notes/${LATER}`);
  });

  it('keeps field edits after a relaunch', async () => {
    serve([], [makeTask(A, 'Call Sam')]);
    const renderer = await launch(TaskScreen);
    await pick(renderer, 'Priority', 'High');
    await pick(renderer, 'Area', 'Personal');
    await pick(renderer, 'Deadline', 'Monday');
    const title = renderer.root.find(
      (node) =>
        (node.type as string) === 'TextInput' &&
        node.props.accessibilityLabel === 'Title',
    );
    act(() => title.props.onChangeText('Call Sam back'));
    act(() => renderer.unmount());
    mounted = [];
    await settle(10);

    expect(server.state.taskStore.get(A)).toMatchObject({
      title: 'Call Sam back',
      priority: 'high',
      area: 'personal',
      dueDate: '2026-10-05',
    });
    const relaunched = await launch(TaskScreen);
    expect(byLabel(relaunched, 'Priority, High')).toBeDefined();
    expect(byLabel(relaunched, 'Area, Personal')).toBeDefined();
    expect(byLabel(relaunched, 'Deadline, Mon, Oct 5')).toBeDefined();
  });

  it('completes from the bottom bar with a haptic', async () => {
    serve([], [makeTask(A, 'Call Sam')]);
    const renderer = await launch(TaskScreen);
    await act(async () => byLabel(renderer, 'Complete task').props.onPress());
    await settle(10);
    expect(Haptics.impactAsync).toHaveBeenCalled();
    expect(server.state.taskStore.get(A)!.status).toBe('done');
    expect(byLabel(renderer, 'Reopen task')).toBeDefined();
  });

  it('deletes from ⋯ after a confirm', async () => {
    serve([], [makeTask(A, 'Call Sam')]);
    const renderer = await launch(TaskScreen);
    act(() => byLabel(renderer, 'Task actions').props.onPress());
    const [options, choose] = sheet();
    expect(options.options).toEqual(['Share', 'Delete', 'Cancel']);
    act(() => choose(1));
    const buttons = vi.mocked(Alert.alert).mock.lastCall![2]!;
    await act(async () => buttons.find((b) => b.text === 'Delete')!.onPress!());
    await settle(10);
    expect(server.state.taskStore.get(A)!.deleted).toBe(true);
    expect(router.back).toHaveBeenCalled();
  });
});
