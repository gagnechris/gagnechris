import { clearPendingFlushes } from '@gagnechris/app-core';
import { ActionSheetIOS } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteScreen from '../app/(tabs)/notes/[id]';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { byLabel, Providers, render, settle } from '../test/render';
import { searchParams } from '../test/router';

const NOTE = '01NOTE0000000000000000000A';
const A = '01HTASKAAAAAAAAAAAAAAAAAAA';
const B = '01HTASKBBBBBBBBBBBBBBBBBBB';

let server: ReturnType<typeof notebookServer>;
let mounted: ReactTestRenderer | null = null;

const serve = (...args: Parameters<typeof notebookServer>) => {
  server = notebookServer(...args);
  vi.stubGlobal('fetch', server.fetch);
};

beforeEach(() => {
  // Friday, Oct 2.
  vi.useFakeTimers({ now: new Date(2026, 9, 2, 9), toFake: ['Date'] });
  searchParams.current = { id: NOTE };
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = null;
  clearPendingFlushes();
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

const lastSheet = () =>
  vi.mocked(ActionSheetIOS.showActionSheetWithOptions).mock.lastCall!;

const choose = async (option: string) => {
  const [sheet, pick] = lastSheet();
  const index = sheet.options.findIndex((o) => o.split(' · ')[0] === option);
  expect(index, `${option} in ${sheet.options.join(', ')}`).toBeGreaterThan(-1);
  await act(async () => pick(index));
};

const longPress = (renderer: ReactTestRenderer, title: string) =>
  act(() => byLabel(renderer, `Open task ${title}`).props.onLongPress());

const savedBody = () => server.state.store.get(NOTE)!.bodyMarkdown;

describe('task row menu', () => {
  it('indents a task under the one above and outdents it again', async () => {
    serve(
      [makeNote(NOTE, `{{task:${A}}}\n{{task:${B}}}\n  why`)],
      [makeTask(A, 'Plan'), makeTask(B, 'Book')],
    );
    const renderer = await renderNote();
    longPress(renderer, 'Plan');
    expect(lastSheet()[0].options).toEqual(['Move to…', 'Delete', 'Cancel']);

    longPress(renderer, 'Book');
    expect(lastSheet()[0].options).toEqual([
      'Move to…',
      'Indent',
      'Delete',
      'Cancel',
    ]);
    await choose('Indent');
    await vi.waitFor(
      () => expect(savedBody()).toBe(`{{task:${A}}}\n  {{task:${B}}}\n    why`),
      { timeout: 3_000 },
    );

    longPress(renderer, 'Book');
    await choose('Outdent');
    await vi.waitFor(
      () => expect(savedBody()).toBe(`{{task:${A}}}\n{{task:${B}}}\n  why`),
      { timeout: 3_000 },
    );
  });

  it('moves a task with its lines to a section', async () => {
    serve(
      [makeNote(NOTE, `## Work\n{{task:${A}}}\n  why\n\n## Home\ndishes`)],
      [makeTask(A, 'Plan')],
    );
    const renderer = await renderNote();
    longPress(renderer, 'Plan');
    await choose('Move to…');
    expect(lastSheet()[0].options.slice(0, 2)).toEqual(['Work', 'Home']);
    await choose('Home');
    await vi.waitFor(
      () =>
        expect(savedBody()).toBe(
          `## Work\n\n## Home\ndishes\n{{task:${A}}}\n  why`,
        ),
      { timeout: 3_000 },
    );
  });

  it('moves a task and its subtasks to tomorrow’s note, keeping the tasks', async () => {
    serve(
      [
        makeNote(NOTE, `top\n{{task:${A}}}\n  {{task:${B}}}\nend`, {
          type: 'daily',
          date: '2026-10-02',
        }),
      ],
      [
        makeTask(A, 'Plan', { noteId: NOTE, startDate: '2026-10-02' }),
        makeTask(B, 'Book', { noteId: NOTE, startDate: '2026-10-02' }),
      ],
    );
    const renderer = await renderNote();
    longPress(renderer, 'Plan');
    await choose('Move to…');
    await choose('Tomorrow’s note');
    await settle(10);

    await vi.waitFor(() => expect(savedBody()).toBe('top\nend'), {
      timeout: 3_000,
    });
    const tomorrow = [...server.state.store.values()].find(
      (n) => n.type === 'daily' && n.date === '2026-10-03',
    )!;
    expect(tomorrow.bodyMarkdown).toContain(`{{task:${A}}}\n  {{task:${B}}}`);
    for (const id of [A, B]) {
      const task = server.state.taskStore.get(id)!;
      expect(task.deleted).toBe(false);
      expect(task.startDate).toBe('2026-10-03');
      expect(task.noteId).toBe(tomorrow.id);
    }
  });
});
