import {
  clearPendingFlushes,
  EMBED_DELETE_GRACE_MS,
  useTasksQuery,
} from '@gagnechris/app-core';
import * as Haptics from 'expo-haptics';
import { NOTEBOOK_TITLE_MAX_LENGTH } from '@gagnechris/shared';
import { ActionSheetIOS, Alert, AppState, Share, Text } from 'react-native';
import {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteScreen from '../app/(tabs)/notes/[id]';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { router, searchParams, segments } from '../test/router';

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

const OpenTaskTitles = () => {
  const open = useTasksQuery({ open: true });
  const titles = open.data?.pages.flatMap((p) => p.items.map((t) => t.title));
  return <Text>{`open: ${titles?.join(', ') ?? '…'}`}</Text>;
};

/** Native text views by toolbar id, so tests see which one gets the caret. */
const textViews = new Map<
  string,
  {
    focus: () => void;
    setSelection: (start: number, end: number) => void;
    isFocused: () => boolean;
  }
>();

const renderNote = async () => {
  textViews.clear();
  const renderer = await render(
    <Providers>
      <NoteScreen />
      <OpenTaskCount />
      <OpenTaskTitles />
    </Providers>,
    {
      createNodeMock: (element) => {
        if ((element.type as string) !== 'TextInput') return null;
        // Called on every ref attach; one record per view keeps its calls.
        const id = String(
          (element.props as { inputAccessoryViewID?: string })
            .inputAccessoryViewID,
        );
        const view = textViews.get(id) ?? {
          focus: vi.fn(),
          setSelection: vi.fn(),
          isFocused: () => false,
        };
        textViews.set(id, view);
        return view;
      },
    },
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

/** The same keystroke with the caret reported first, as iOS also does. */
const typeCaretFirst = (renderer: ReactTestRenderer, text: string) => {
  act(() =>
    bodies(renderer)
      .at(-1)!
      .props.onSelectionChange({
        nativeEvent: { selection: { start: text.length, end: text.length } },
      }),
  );
  act(() => bodies(renderer).at(-1)!.props.onChangeText(text));
};

/** Task lines convert once typing pauses. */
const pause = async () => {
  await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
  await settle(10);
};

/** The keyboard toolbar iOS shows over `input`. */
const toolbarOf = (renderer: ReactTestRenderer, input: ReactTestInstance) =>
  renderer.root.find(
    (node) =>
      (node.type as string) === 'InputAccessoryView' &&
      node.props.nativeID === input.props.inputAccessoryViewID,
  );

/** Presses `label`, from the last text run's toolbar when every run has one. */
const press = async (renderer: ReactTestRenderer, label: string) => {
  const matches = (root: ReactTestInstance) =>
    root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === label,
    );
  const all = matches(renderer.root);
  const target =
    all.length === 1
      ? all[0]!
      : matches(toolbarOf(renderer, bodies(renderer).at(-1)!))[0]!;
  await act(async () => target.props.onPress());
};

describe('note editor', () => {
  it('turns `[ ] Call Sam @mon !high` + return into one task for next Monday, high priority', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();

    type(renderer, '[ ] Call Sam @mon !high');
    expect(server.state.taskStore.size).toBe(0);
    type(renderer, '[ ] Call Sam @mon !high\n');
    expect(server.state.taskStore.size).toBe(0);
    await pause();

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

  it('converts every task line typed in one burst, once typing pauses', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();

    let text = '';
    for (const char of '[ ] One\n[ ] Two\n[ ] Three\nDone') {
      text += char;
      typeCaretFirst(renderer, text);
    }
    await settle(10);
    expect(server.state.taskStore.size).toBe(0);

    await pause();
    const titles = [...server.state.taskStore.values()].map((t) => t.title);
    expect(titles).toEqual(['One', 'Two', 'Three']);
    expect(bodies(renderer).at(-1)!.props.value).toBe('Done');

    // A keystroke iOS sent before it took the converted text.
    typeCaretFirst(renderer, `${text}!`);
    expect(bodies(renderer).at(-1)!.props.value).toBe('Done!');
    const ids = [...server.state.taskStore.keys()];
    await vi.waitFor(
      () =>
        expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe(
          `${ids.map((id) => `{{task:${id}}}\n`).join('')}Done!`,
        ),
      { timeout: 3_000 },
    );
  });

  it('keeps a task line typed again after its twin became a task', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();

    type(renderer, '[ ] One');
    type(renderer, '[ ] One\n');
    await pause();
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

  it('opens "Pick a date…" on today each time, not on the last pick', async () => {
    serve([makeNote(NOTE, '')]);
    const renderer = await renderNote();
    const pickedDay = () =>
      renderer.root.find((node) => (node.type as string) === 'DateTimePicker')
        .props.value as Date;
    const done = () =>
      act(() =>
        renderer.root
          .find(
            (node) =>
              (node.type as string) === 'Pressable' &&
              node.findAll((child) => child.children.includes('Done')).length >
                0,
          )
          .props.onPress(),
      );

    type(renderer, '[ ] A @');
    await press(renderer, 'Pick a date…');
    act(() =>
      renderer.root
        .find((node) => (node.type as string) === 'DateTimePicker')
        .props.onChange({}, new Date(2026, 9, 20)),
    );
    done();
    expect(bodies(renderer).at(-1)!.props.value).toBe('[ ] A @oct 20 ');

    type(renderer, '[ ] A @oct 20 \n[ ] B @');
    await press(renderer, 'Pick a date…');
    expect(pickedDay().getDate()).toBe(2);
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

  it('gives every text run its own keyboard toolbar', async () => {
    serve(
      [makeNote(NOTE, `Before\n{{task:${TASK}}}\nAfter`)],
      [makeTask(TASK, 'Ship it')],
    );
    const renderer = await renderNote();
    type(renderer, 'After\n[ ] Call Sam\n');
    await pause();

    const runs = bodies(renderer);
    expect(runs.length).toBeGreaterThanOrEqual(3);
    const ids = runs.map((input) => input.props.inputAccessoryViewID);
    expect(new Set(ids).size).toBe(ids.length);
    for (const input of runs) {
      const toolbar = toolbarOf(renderer, input);
      expect(
        toolbar.find((node) => node.props.accessibilityRole === 'toolbar'),
      ).toBeTruthy();
    }

    // The date chips show on the run being typed in, not the others.
    type(renderer, '[ ] Call Sam back @');
    const withChips = bodies(renderer).filter(
      (input) =>
        toolbarOf(renderer, input).findAll(
          (node) => node.props.accessibilityRole === 'menuitem',
        ).length > 0,
    );
    expect(withChips).toEqual([bodies(renderer).at(-1)]);
  });

  it('keeps an empty line between tasks a thin strip until it has the caret', async () => {
    const SECOND = '01HTASKBBBBBBBBBBBBBBBBBBB';
    serve(
      [makeNote(NOTE, `{{task:${TASK}}}\n{{task:${SECOND}}}`)],
      [makeTask(TASK, 'Ship it'), makeTask(SECOND, 'Tell Sam')],
    );
    const renderer = await renderNote();
    const styles = () =>
      bodies(renderer).map(
        (input) =>
          Object.assign({}, ...[input.props.style].flat(2)) as {
            height?: number;
            marginTop?: number;
            marginBottom?: number;
            zIndex?: number;
          },
      );
    // Laid out, each strip takes 4 pt; it reaches 8 pt into the rows around
    // it (not above the first row) and sits on top of them for taps.
    const footprint = (s: ReturnType<typeof styles>[number]) =>
      (s.height ?? 0) + (s.marginTop ?? 0) + (s.marginBottom ?? 0);
    expect(styles().map((s) => s.height)).toEqual([12, 20, undefined]);
    expect(styles().slice(0, 2).map(footprint)).toEqual([4, 4]);
    expect(styles()[0]!.marginTop).toBeUndefined();
    expect(
      styles()
        .slice(0, 2)
        .map((s) => s.zIndex),
    ).toEqual([1, 1]);

    act(() =>
      bodies(renderer)[1]!.props.onSelectionChange({
        nativeEvent: { selection: { start: 0, end: 0 } },
      }),
    );
    expect(styles().map((s) => s.height)).toEqual([12, undefined, undefined]);
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

  it('opens task detail from the open button on an embedded task', async () => {
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
    const open = byLabel(renderer, 'Open task Ship it');
    expect(open.props.accessibilityRole).toBe('button');
    act(() => open.props.onPress());
    expect(router.push).toHaveBeenCalledWith(`/tasks/${TASK}`);
  });

  it('opens an embedded task on the Notes stack, so Back returns to the note', async () => {
    segments.current = ['(tabs)', 'notes', '[id]'];
    serve([makeNote(NOTE, `{{task:${TASK}}}`)], [makeTask(TASK, 'Ship it')]);
    const renderer = await renderNote();
    act(() => byLabel(renderer, 'Open task Ship it').props.onPress());
    expect(router.push).toHaveBeenCalledWith(`/notes/task/${TASK}`);
  });

  it('renames an embedded task from its title, everywhere', async () => {
    serve(
      [makeNote(NOTE, `{{task:${TASK}}}`)],
      [makeTask(TASK, 'Ship it', { startDate: '2026-10-02' })],
    );
    const renderer = await renderNote();
    expect(allText(renderer)).toContain('open: Ship it');

    const field = () => byLabel(renderer, 'Task title');
    expect(field().props.value).toBe('Ship it');
    expect(field().props.maxLength).toBe(NOTEBOOK_TITLE_MAX_LENGTH);
    act(() => field().props.onFocus());
    act(() => field().props.onChangeText('Ship it today  '));
    act(() => field().props.onBlur());
    await settle(10);

    expect(server.state.taskStore.get(TASK)!.title).toBe('Ship it today');
    expect(field().props.value).toBe('Ship it today');
    expect(byLabel(renderer, 'Open task Ship it today')).toBeTruthy();
    await vi.waitFor(
      () => expect(allText(renderer)).toContain('open: Ship it today'),
      { timeout: 3_000 },
    );
    expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe(`{{task:${TASK}}}`);
  });

  it('saves a task title while typing, after a pause', async () => {
    serve([makeNote(NOTE, `{{task:${TASK}}}`)], [makeTask(TASK, 'Ship it')]);
    const renderer = await renderNote();
    const field = () => byLabel(renderer, 'Task title');
    act(() => field().props.onFocus());
    act(() => field().props.onChangeText('Ship it now'));
    expect(server.state.taskStore.get(TASK)!.title).toBe('Ship it');
    await vi.waitFor(
      () => expect(server.state.taskStore.get(TASK)!.title).toBe('Ship it now'),
      { timeout: 3_000 },
    );
    expect(field().props.value).toBe('Ship it now');
  });

  it('puts an emptied task title back instead of saving it', async () => {
    serve([makeNote(NOTE, `{{task:${TASK}}}`)], [makeTask(TASK, 'Ship it')]);
    const renderer = await renderNote();
    const field = () => byLabel(renderer, 'Task title');
    act(() => field().props.onFocus());
    act(() => field().props.onChangeText('  '));
    act(() => field().props.onBlur());
    await settle(10);

    expect(field().props.value).toBe('Ship it');
    expect(server.state.taskStore.get(TASK)).toMatchObject({
      title: 'Ship it',
      deleted: false,
    });
  });

  it('keeps a done task title editable and struck through', async () => {
    serve(
      [makeNote(NOTE, `{{task:${TASK}}}`)],
      [makeTask(TASK, 'Ship it', { status: 'done' })],
    );
    const renderer = await renderNote();
    const style = Object.assign(
      {},
      ...[byLabel(renderer, 'Task title').props.style].flat(2),
    ) as { textDecorationLine?: string };
    expect(style.textDecorationLine).toBe('line-through');
  });

  it('moves the caret onto a new line under the task on Return', async () => {
    serve(
      [makeNote(NOTE, `{{task:${TASK}}}\nmore`)],
      [makeTask(TASK, 'Ship it')],
    );
    const renderer = await renderNote();
    const after = textViews.get(
      bodies(renderer).at(-1)!.props.inputAccessoryViewID,
    )!;
    act(() => byLabel(renderer, 'Task title').props.onSubmitEditing());
    await settle(2);

    expect(bodies(renderer).at(-1)!.props.value).toBe('\nmore');
    expect(after.focus).toHaveBeenCalled();
    expect(after.setSelection).toHaveBeenLastCalledWith(0, 0);
    await vi.waitFor(
      () =>
        expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe(
          `{{task:${TASK}}}\n\nmore`,
        ),
      { timeout: 3_000 },
    );
  });

  it('moves the caret to the empty line under the task on Return', async () => {
    serve([makeNote(NOTE, `{{task:${TASK}}}`)], [makeTask(TASK, 'Ship it')]);
    const renderer = await renderNote();
    const after = textViews.get(
      bodies(renderer).at(-1)!.props.inputAccessoryViewID,
    )!;
    act(() => byLabel(renderer, 'Task title').props.onSubmitEditing());
    await settle(2);
    expect(after.focus).toHaveBeenCalled();
    expect(after.setSelection).toHaveBeenLastCalledWith(0, 0);
    expect(bodies(renderer).at(-1)!.props.value).toBe('');
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
    const toolbar = toolbarOf(renderer, bodies(renderer).at(-1)!).find(
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
    const title = byLabel(renderer, 'Task title');
    expect(title.props.value).toBe('Ship it');
    expect(title.props.accessibilityActions).toEqual([
      { name: 'remove', label: 'Delete task' },
    ]);
    expect(byLabel(renderer, 'Open task Ship it').props.accessibilityRole).toBe(
      'button',
    );
  });

  it('deletes a task from its long-press menu, line and all', async () => {
    serve(
      [makeNote(NOTE, `a\n{{task:${TASK}}}\nb`)],
      [makeTask(TASK, 'Ship it')],
    );
    const renderer = await renderNote();
    act(() => byLabel(renderer, 'Open task Ship it').props.onLongPress());
    const [sheet, pick] = vi.mocked(ActionSheetIOS.showActionSheetWithOptions)
      .mock.lastCall!;
    expect(sheet.options).toEqual(['Delete task', 'Cancel']);
    act(() => pick(0));
    await vi.waitFor(
      () => expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe('a\nb'),
      { timeout: 3_000 },
    );
    await vi.waitFor(
      () => expect(server.state.taskStore.get(TASK)!.deleted).toBe(true),
      { timeout: EMBED_DELETE_GRACE_MS * 2 },
    );
  }, 15_000);

  it('deletes a task when Backspace is pressed in its emptied title', async () => {
    serve(
      [makeNote(NOTE, `a\n{{task:${TASK}}}\nb`)],
      [makeTask(TASK, 'Ship it')],
    );
    const renderer = await renderNote();
    const field = () => byLabel(renderer, 'Task title');
    act(() => field().props.onFocus());
    act(() => field().props.onKeyPress({ nativeEvent: { key: 'Backspace' } }));
    expect(allText(renderer)).toContain('Ship it');

    act(() => field().props.onChangeText(''));
    act(() => field().props.onKeyPress({ nativeEvent: { key: 'Backspace' } }));
    expect(() => byLabel(renderer, 'Task title')).toThrow();
    await vi.waitFor(
      () => expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe('a\nb'),
      { timeout: 3_000 },
    );
    await vi.waitFor(
      () => expect(server.state.taskStore.get(TASK)!.deleted).toBe(true),
      { timeout: EMBED_DELETE_GRACE_MS * 2 },
    );
    expect(server.state.taskStore.get(TASK)!.title).toBe('Ship it');
  }, 15_000);

  it('takes the line of a task deleted elsewhere out of the note', async () => {
    serve(
      [makeNote(NOTE, `a\n{{task:${TASK}}}\nb`)],
      [makeTask(TASK, 'Ship it')],
    );
    server.deleteTask(TASK);
    const renderer = await renderNote();
    await vi.waitFor(
      () => expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe('a\nb'),
      { timeout: 3_000 },
    );
    expect(allText(renderer)).not.toContain('Deleted task');
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
