import { clearPendingFlushes, useTasksQuery } from '@gagnechris/app-core';
import * as Haptics from 'expo-haptics';
import { ActionSheetIOS, Alert, AppState, Share, Text } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteScreen from '../app/(tabs)/notes/[id]';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { router, searchParams } from '../test/router';

const NOTE = '01NOTE0000000000000000000A';
const TASK = '01HTASKAAAAAAAAAAAAAAAAAAA';

let server: ReturnType<typeof notebookServer>;
let mounted: ReactTestRenderer | null = null;

const serve = (...args: Parameters<typeof notebookServer>) => {
  server = notebookServer(...args);
  vi.stubGlobal('fetch', server.fetch);
};

beforeEach(() => {
  // Friday, Oct 2: `@mon` is Oct 5.
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
  searchParams.current = { id: NOTE };
});

afterEach(() => {
  // A mounted editor would keep saving into the next test's server.
  act(() => mounted?.unmount());
  mounted = null;
  clearPendingFlushes();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const OpenTaskCount = () => {
  const open = useTasksQuery({ open: true });
  const count = open.data?.pages.flatMap((p) => p.items).length;
  return <Text>{`open tasks: ${count ?? '…'}`}</Text>;
};

const renderNote = async () => {
  const renderer = await render(
    <Providers>
      <NoteScreen />
      <OpenTaskCount />
    </Providers>,
  );
  mounted = renderer;
  await settle(10);
  return renderer;
};

const bodies = (renderer: ReactTestRenderer) =>
  renderer.root.findAll(
    (node) =>
      (node.type as string) === 'TextInput' &&
      node.props.accessibilityLabel === 'Note body',
  );

/** Types into the last text run, as iOS reports it: text, then the caret. */
const type = (renderer: ReactTestRenderer, text: string) => {
  const input = bodies(renderer).at(-1)!;
  act(() => input.props.onChangeText(text));
  act(() =>
    bodies(renderer)
      .at(-1)!
      .props.onSelectionChange({
        nativeEvent: { selection: { start: text.length, end: text.length } },
      }),
  );
};

const press = async (renderer: ReactTestRenderer, label: string) => {
  await act(async () => byLabel(renderer, label).props.onPress());
};

describe('note editor', () => {
  it('turns `[ ] Call Sam @mon !high` + return into one task for next Monday, high priority', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();

    type(renderer, '[ ] Call Sam @mon !high');
    expect(server.state.taskStore.size).toBe(0);
    type(renderer, '[ ] Call Sam @mon !high\n');
    await settle(10);

    const tasks = [...server.state.taskStore.values()];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: 'Call Sam',
      startDate: '2026-10-05',
      someday: false,
      priority: 'high',
      noteId: NOTE,
      area: 'work',
    });
    expect(
      server.state.calls.filter((c) => c === 'POST /api/notebook/tasks'),
    ).toHaveLength(1);

    const row = byLabel(renderer, 'Complete Call Sam');
    expect(row.props.accessibilityRole).toBe('checkbox');
    expect(bodies(renderer).at(-1)!.props.value).toBe('');
    await vi.waitFor(
      () =>
        expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe(
          `{{task:${tasks[0]!.id}}}\n`,
        ),
      { timeout: 3_000 },
    );
  });

  it('converts task lines typed faster than the text view takes the converted text', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();

    type(renderer, '[ ] One');
    type(renderer, '[ ] One\n');
    // iOS drops the converted text while keystrokes are in flight, so the
    // next ones still carry the line that became a task.
    type(renderer, '[ ] One\n[ ] Two');
    type(renderer, '[ ] One\n[ ] Two\n');
    type(renderer, '[ ] One\n[ ] Two\n[ ] Three');
    type(renderer, '[ ] One\n[ ] Two\n[ ] Three\n');
    await settle(10);

    const titles = [...server.state.taskStore.values()].map((t) => t.title);
    expect(titles).toEqual(['One', 'Two', 'Three']);
    expect(bodies(renderer).at(-1)!.props.value).toBe('');
    const ids = [...server.state.taskStore.keys()];
    await vi.waitFor(
      () =>
        expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe(
          ids.map((id) => `{{task:${id}}}\n`).join(''),
        ),
      { timeout: 3_000 },
    );
  });

  it('keeps a task line typed again after its twin became a task', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();

    type(renderer, '[ ] One');
    type(renderer, '[ ] One\n');
    type(renderer, '[ ] One');
    await settle(10);

    expect(server.state.taskStore.size).toBe(1);
    expect(bodies(renderer).at(-1)!.props.value).toBe('[ ] One');
  });

  it('leaves a task line alone when a backspace pulls it up', async () => {
    serve([makeNote(NOTE, 'a\n\n[ ] B')]);
    const renderer = await renderNote();
    const caret = (at: number) =>
      act(() =>
        bodies(renderer)
          .at(-1)!
          .props.onSelectionChange({
            nativeEvent: { selection: { start: at, end: at } },
          }),
      );
    caret(2);
    act(() => bodies(renderer).at(-1)!.props.onChangeText('a\n[ ] B'));
    caret(1);
    await settle();
    expect(server.state.taskStore.size).toBe(0);
    expect(bodies(renderer).at(-1)!.props.value).toBe('a\n[ ] B');
  });

  it('shows the date chips while typing @ on a task line, and inserts the pick', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();

    type(renderer, 'Call Sam @');
    expect(allText(renderer)).not.toContain('Show this task on');

    type(renderer, '[ ] Call Sam @');
    expect(allText(renderer)).toContain('Show this task on');
    const chips = renderer.root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityRole === 'menuitem',
      )
      .map((node) => node.props.accessibilityLabel as string);
    expect(chips.map((c) => c.split(',')[0])).toEqual([
      'Tomorrow',
      'Monday',
      'Next week',
      'Someday',
      'Pick a date…',
      'Deadline…',
    ]);

    await press(renderer, chips[1]!);
    expect(bodies(renderer).at(-1)!.props.value).toBe('[ ] Call Sam @mon ');
    expect(allText(renderer)).not.toContain('Show this task on');
  });

  it('runs each toolbar button on the focused text', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();
    type(renderer, 'Call Sam');
    await press(renderer, 'Task');
    expect(bodies(renderer).at(-1)!.props.value).toBe('[ ] Call Sam');
    await press(renderer, 'Priority');
    expect(bodies(renderer).at(-1)!.props.value).toBe('[ ] Call Sam !');
    await press(renderer, 'Heading');
    expect(bodies(renderer).at(-1)!.props.value).toBe('# [ ] Call Sam !');
  });

  it('completes an embedded task everywhere, with a haptic', async () => {
    serve(
      [makeNote(NOTE, `Today\n{{task:${TASK}}}`)],
      [makeTask(TASK, 'Ship it', { startDate: '2026-10-02' })],
    );
    const renderer = await renderNote();
    expect(allText(renderer)).toContain('open tasks: 1');

    await press(renderer, 'Complete Ship it');
    await settle(10);

    expect(Haptics.impactAsync).toHaveBeenCalled();
    expect(server.state.taskStore.get(TASK)!.status).toBe('done');
    expect(
      byLabel(renderer, 'Reopen Ship it').props.accessibilityState,
    ).toEqual({ checked: true, disabled: undefined });
    expect(allText(renderer)).toContain('open tasks: 0');
  });

  it('opens task detail from an embedded task title', async () => {
    serve(
      [makeNote(NOTE, `{{task:${TASK}}}`)],
      [
        makeTask(TASK, 'Ship it', {
          priority: 'high',
          startDate: '2026-10-05',
        }),
      ],
    );
    const renderer = await renderNote();
    const title = byLabel(renderer, 'Ship it, @Mon, High priority');
    expect(title.props.accessibilityRole).toBe('button');
    act(() => title.props.onPress());
    expect(router.push).toHaveBeenCalledWith(`/tasks/${TASK}`);
  });

  it('saves straight away when the app goes to the background', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();
    type(renderer, 'Half a thought');
    const listeners = vi
      .mocked(AppState.addEventListener)
      .mock.calls.map(([, listener]) => listener);
    await act(async () => {
      for (const listener of listeners) listener('background');
    });
    await settle();
    // Well inside the autosave debounce: only the background flush sent it.
    expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe('Half a thought');
  });

  it('gives VoiceOver the toolbar and the task rows', async () => {
    serve([makeNote(NOTE, `{{task:${TASK}}}`)], [makeTask(TASK, 'Ship it')]);
    const renderer = await renderNote();
    const toolbar = renderer.root.find(
      (node) => node.props.accessibilityRole === 'toolbar',
    );
    const buttons = toolbar
      .findAll(
        (node) =>
          (node.type as string) === 'Pressable' &&
          node.props.accessibilityRole === 'button',
      )
      .map((node) => node.props.accessibilityLabel);
    expect(buttons).toEqual([
      'Task',
      'Date',
      'Priority',
      'Heading',
      'List',
      'Link',
      'Hide keyboard',
    ]);
    expect(byLabel(renderer, 'Complete Ship it').props.accessibilityRole).toBe(
      'checkbox',
    );
    const title = byLabel(renderer, 'Ship it');
    expect(title.props.accessibilityActions).toEqual([
      { name: 'remove', label: 'Remove from note' },
    ]);
  });

  it('removes an embed from the note, leaving the task', async () => {
    serve(
      [makeNote(NOTE, `a\n{{task:${TASK}}}\nb`)],
      [makeTask(TASK, 'Ship it')],
    );
    const renderer = await renderNote();
    act(() => byLabel(renderer, 'Ship it').props.onLongPress());
    const [, pick] = vi.mocked(ActionSheetIOS.showActionSheetWithOptions).mock
      .lastCall!;
    act(() => pick(0));
    await vi.waitFor(
      () => expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe('a\nb'),
      { timeout: 3_000 },
    );
    expect(server.state.taskStore.get(TASK)!.deleted).toBe(false);
  });

  it('pins, shares and deletes from the ⋯ menu', async () => {
    serve([makeNote(NOTE, 'Body', { title: 'Plan' })]);
    const renderer = await renderNote();
    const choose = async (option: string) => {
      await press(renderer, 'Note actions');
      const [sheet, pick] = vi.mocked(ActionSheetIOS.showActionSheetWithOptions)
        .mock.lastCall!;
      await act(async () => pick(sheet.options.indexOf(option)));
    };

    await choose('Pin');
    expect(byLabel(renderer, 'Pinned')).toBeTruthy();
    await vi.waitFor(
      () => expect(server.state.store.get(NOTE)!.pinned).toBe(true),
      { timeout: 3_000 },
    );

    await choose('Share');
    expect(Share.share).toHaveBeenCalledWith({
      title: 'Plan',
      message: 'Body',
    });

    await choose('Delete');
    const [title, , buttons] = vi.mocked(Alert.alert).mock.lastCall!;
    expect(title).toBe('Delete this page?');
    await act(async () =>
      buttons!.find((b) => b.text === 'Delete')!.onPress!(),
    );
    await settle();
    expect(server.state.store.get(NOTE)!.deleted).toBe(true);
    expect(router.back).toHaveBeenCalled();
  });

  it('adds and removes tags', async () => {
    serve([makeNote(NOTE, '', { tags: ['q4'] })]);
    const renderer = await renderNote();
    await press(renderer, 'Add tag');
    const [, , onTag] = vi.mocked(Alert.prompt).mock.lastCall!;
    act(() => (onTag as (value: string) => void)(' launch '));
    expect(byLabel(renderer, 'Tag launch')).toBeTruthy();

    await press(renderer, 'Tag q4');
    const [, , buttons] = vi.mocked(Alert.alert).mock.lastCall!;
    await act(async () =>
      buttons!.find((b) => b.text === 'Remove')!.onPress!(),
    );
    await vi.waitFor(
      () => expect(server.state.store.get(NOTE)!.tags).toEqual(['launch']),
      { timeout: 3_000 },
    );
  });

  it('previews the markdown with live task rows', async () => {
    serve(
      [makeNote(NOTE, `# Plan\n{{task:${TASK}}}`)],
      [makeTask(TASK, 'Ship it')],
    );
    const renderer = await renderNote();
    await press(renderer, 'Preview');
    expect(bodies(renderer)).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'md-root' })).toBeTruthy();
    expect(byLabel(renderer, 'Complete Ship it')).toBeTruthy();
  });
});
