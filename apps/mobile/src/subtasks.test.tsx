import { clearPendingFlushes } from '@gagnechris/app-core';
import { Alert } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteScreen from '../app/(tabs)/notes/[id]';
import { resetTaskDetailsStore } from './notebook/taskDetailsStore';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { searchParams } from '../test/router';

const NOTE = '01NOTE0000000000000000000A';
const P = '01HTASKPPPPPPPPPPPPPPPPPPP';
const A = '01HTASKAAAAAAAAAAAAAAAAAAA';
const B = '01HTASKBBBBBBBBBBBBBBBBBBB';
const T = '01HTASKTTTTTTTTTTTTTTTTTTT';

let server: ReturnType<typeof notebookServer>;
let mounted: ReactTestRenderer | null = null;

const serve = (...args: Parameters<typeof notebookServer>) => {
  server = notebookServer(...args);
  vi.stubGlobal('fetch', server.fetch);
};

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
  searchParams.current = { id: NOTE };
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  clearPendingFlushes();
  resetTaskDetailsStore();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const renderNote = async () => {
  const renderer = await render(
    <Providers>
      <NoteScreen />
    </Providers>,
  );
  mounted = renderer;
  await settle(10);
  return renderer;
};

const titled = (renderer: ReactTestRenderer, title: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityLabel === `Open task ${title}`,
  ).length;

const bodies = (renderer: ReactTestRenderer) =>
  renderer.root.findAll(
    (node) =>
      (node.type as string) === 'TextInput' &&
      node.props.accessibilityLabel === 'Note body',
  );

const titleFields = (renderer: ReactTestRenderer) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      node.props.accessibilityLabel === 'Task title',
  );

const savedBody = (body: string) =>
  vi.waitFor(
    () => expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe(body),
    { timeout: 3_000 },
  );

const family = () =>
  serve(
    [
      makeNote(
        NOTE,
        `{{task:${P}}}\n  {{task:${A}}}\n    why\n  {{task:${B}}}\nafter`,
      ),
    ],
    [
      makeTask(P, 'Trip', { noteId: NOTE }),
      makeTask(A, 'Book hotel', {
        noteId: NOTE,
        parentId: P,
        status: 'done',
      }),
      makeTask(B, 'Pack', { noteId: NOTE, parentId: P }),
    ],
  );

describe('subtasks in a note', () => {
  it('nests subtasks under a guide and counts them on the parent', async () => {
    family();
    const renderer = await renderNote();
    const progress = byLabel(renderer, '1 of 2 subtasks done');
    expect(progress.props.accessibilityState).toEqual({ expanded: true });
    expect(allText(renderer)).toContain('1 of 2');
    expect(allText(renderer)).not.toContain('All done');
  });

  it('folds and unfolds the subtasks and the lines under them', async () => {
    family();
    const renderer = await renderNote();
    await act(async () =>
      byLabel(renderer, '1 of 2 subtasks done').props.onPress(),
    );
    expect(titled(renderer, 'Book hotel')).toBe(0);
    expect(titled(renderer, 'Pack')).toBe(0);
    expect(titled(renderer, 'Trip')).toBe(1);
    const bodies = renderer.root
      .findAll(
        (node) =>
          (node.type as string) === 'TextInput' &&
          node.props.accessibilityLabel === 'Note body',
      )
      .map((n) => n.props.value as string);
    expect(bodies).not.toContain('    why');
    expect(bodies).toContain('after');

    await act(async () =>
      byLabel(renderer, '1 of 2 subtasks done').props.onPress(),
    );
    expect(titled(renderer, 'Pack')).toBe(1);
  });

  it('folds only the lines in the block when the text under the last subtask runs on past it', async () => {
    serve(
      [
        makeNote(
          NOTE,
          `{{task:${P}}}\n  {{task:${A}}}\n  {{task:${B}}}\n    why\nafter`,
        ),
      ],
      [
        makeTask(P, 'Trip', { noteId: NOTE }),
        makeTask(A, 'Book hotel', { noteId: NOTE, parentId: P }),
        makeTask(B, 'Pack', { noteId: NOTE, parentId: P }),
      ],
    );
    const renderer = await renderNote();
    await act(async () =>
      byLabel(renderer, '0 of 2 subtasks done').props.onPress(),
    );
    const bodies = () =>
      renderer.root.findAll(
        (node) =>
          (node.type as string) === 'TextInput' &&
          node.props.accessibilityLabel === 'Note body',
      );
    expect(bodies().map((n) => n.props.value)).toEqual(['', 'after']);

    const after = bodies().find((n) => n.props.value === 'after')!;
    act(() => after.props.onChangeText('after!'));
    await vi.waitFor(
      () =>
        expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe(
          `{{task:${P}}}\n  {{task:${A}}}\n  {{task:${B}}}\n    why\nafter!`,
        ),
      { timeout: 3_000 },
    );
  });

  it('asks when a parent is checked with subtasks open, and completes them all', async () => {
    family();
    const renderer = await renderNote();
    await act(async () => byLabel(renderer, 'Complete Trip').props.onPress());
    await settle(10);
    const [title, message, buttons] = vi.mocked(Alert.alert).mock.lastCall!;
    expect(title).toBe('Finish Trip?');
    expect(message).toBe('1 subtask is still open.');
    expect(buttons!.map((b) => b.text)).toEqual([
      'Complete all',
      'Just the parent',
      'Undo',
    ]);
    await act(async () => buttons![0]!.onPress!());
    await settle(10);
    expect(server.state.taskStore.get(P)!.status).toBe('done');
    expect(server.state.taskStore.get(B)!.status).toBe('done');
  });

  it('puts the parent back on Undo', async () => {
    family();
    const renderer = await renderNote();
    await act(async () => byLabel(renderer, 'Complete Trip').props.onPress());
    await settle(10);
    const [, , buttons] = vi.mocked(Alert.alert).mock.lastCall!;
    await act(async () => buttons!.find((b) => b.text === 'Undo')!.onPress!());
    await settle(10);
    expect(server.state.taskStore.get(P)!.status).toBe('todo');
    expect(server.state.taskStore.get(B)!.status).toBe('todo');
  });

  it('shows All done once every subtask is done', async () => {
    serve(
      [makeNote(NOTE, `{{task:${P}}}\n  {{task:${A}}}`)],
      [
        makeTask(P, 'Trip'),
        makeTask(A, 'Book hotel', { parentId: P, status: 'done' }),
      ],
    );
    const renderer = await renderNote();
    expect(allText(renderer)).toContain('All done');
  });

  it('labels a carried-in subtask with its finished parent’s title', async () => {
    serve(
      [makeNote(NOTE, `{{task:${B}}}`)],
      [
        makeTask(P, 'Trip', { status: 'done' }),
        makeTask(B, 'Pack', { parentId: P }),
      ],
    );
    const renderer = await renderNote();
    await settle(10);
    expect(byLabel(renderer, 'Subtask of Trip, finished')).toBeTruthy();
  });

  it.each([
    ['a parent', 0],
    ['a subtask with a sibling below', 1],
  ])(
    'Return in the title of %s opens a line after the whole block',
    async (_, row) => {
      family();
      const renderer = await renderNote();
      act(() => titleFields(renderer)[row]!.props.onSubmitEditing());
      await settle(2);
      const opened = bodies(renderer).find((b) => b.props.value === '\nafter')!;
      act(() => opened.props.onChangeText('Call hotel\nafter'));
      await savedBody(
        `{{task:${P}}}\n  {{task:${A}}}\n    why\n  {{task:${B}}}\nCall hotel\nafter`,
      );
    },
  );

  it('puts a paste that starts with a line break under a row after its block', async () => {
    family();
    const renderer = await renderNote();
    const [, underParent] = bodies(renderer);
    expect(underParent!.props.value).toBe('');
    act(() =>
      underParent!.props.onChangeText('\nCall hotel', { start: 11, end: 11 }),
    );
    await savedBody(
      `{{task:${P}}}\n  {{task:${A}}}\n    why\n  {{task:${B}}}\nCall hotel\nafter`,
    );
    const why = bodies(renderer).find((b) => b.props.value === '    why')!;
    act(() => why.props.onChangeText('\nPack    why', { start: 5, end: 5 }));
    await savedBody(
      `{{task:${P}}}\n  {{task:${A}}}\n    why\n  {{task:${B}}}\nPack\nCall hotel\nafter`,
    );
  });

  const parentBelowTask = () =>
    serve(
      [
        makeNote(
          NOTE,
          `{{task:${T}}}\n{{task:${P}}}\n  {{task:${A}}}\n    why`,
        ),
      ],
      [
        makeTask(T, 'Errands', { noteId: NOTE }),
        makeTask(P, 'Trip', { noteId: NOTE }),
        makeTask(A, 'Book hotel', { noteId: NOTE, parentId: P }),
      ],
    );

  it('deleting a parent moves its subtasks out to its level, not under the task above', async () => {
    parentBelowTask();
    const renderer = await renderNote();
    const field = () => titleFields(renderer)[1]!;
    act(() => field().props.onFocus());
    act(() => field().props.onChangeText(''));
    vi.setSystemTime(Date.now() + 1_000);
    act(() => field().props.onKeyPress({ nativeEvent: { key: 'Backspace' } }));
    vi.setSystemTime(Date.now() + 1_000);
    act(() => field().props.onKeyPress({ nativeEvent: { key: 'Backspace' } }));
    await savedBody(`{{task:${T}}}\n{{task:${A}}}\n  why`);
  });

  it('a parent deleted elsewhere leaves its subtasks at its level', async () => {
    parentBelowTask();
    server.deleteTask(P);
    await renderNote();
    await savedBody(`{{task:${T}}}\n{{task:${A}}}\n  why`);
  });
});
