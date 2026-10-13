import { clearPendingFlushes } from '@gagnechris/app-core';
import { ActionSheetIOS, Alert } from 'react-native';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteScreen from '../app/(tabs)/notes/[id]';
import {
  loadTaskDetailsStore,
  resetTaskDetailsStore,
  TASK_DETAILS_OPEN_KEY,
  TASK_PEEK_NOTES_KEY,
} from './notebook/taskDetailsStore';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import { asyncStorage } from '../test/nativeFakes';
import { allText, byLabel, Providers, render, settle } from '../test/render';
import { searchParams } from '../test/router';

const NOTE = '01NOTE0000000000000000000A';
const TASK = '01HTASKAAAAAAAAAAAAAAAAAAA';

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

afterEach(async () => {
  act(() => mounted?.unmount());
  mounted = null;
  clearPendingFlushes();
  resetTaskDetailsStore();
  await asyncStorage.clear();
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

const queryLabel = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityLabel === label,
  )[0];

const pick = async (option: string) => {
  const [sheet, choose] = vi.mocked(ActionSheetIOS.showActionSheetWithOptions)
    .mock.lastCall!;
  const index = sheet.options.findIndex(
    (o) => o.replace(/^✓ /, '').split(' · ')[0] === option,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  await act(async () => choose(index));
};

describe('task details in a note', () => {
  it('opens the details under the row and folds them back', async () => {
    serve(
      [makeNote(NOTE, `{{task:${TASK}}}\nAfter`)],
      [makeTask(TASK, 'Ship it', { description: 'Check the logs' })],
    );
    await loadTaskDetailsStore(asyncStorage);
    const renderer = await renderNote();
    const chevron = () => byLabel(renderer, 'Details for Ship it');
    expect(chevron().props.accessibilityState).toEqual({ expanded: false });
    expect(queryLabel(renderer, 'Description of Ship it')).toBeUndefined();

    await act(async () => chevron().props.onPress());
    expect(chevron().props.accessibilityState).toEqual({ expanded: true });
    expect(byLabel(renderer, 'Description of Ship it').props.value).toBe(
      'Check the logs',
    );
    expect(byLabel(renderer, 'Open task Ship it')).toBeTruthy();
    expect(asyncStorage.data.get(TASK_DETAILS_OPEN_KEY)).toBe(
      JSON.stringify([TASK]),
    );

    await act(async () => chevron().props.onPress());
    expect(queryLabel(renderer, 'Description of Ship it')).toBeUndefined();
  });

  it('saves the description on its own', async () => {
    serve([makeNote(NOTE, `{{task:${TASK}}}`)], [makeTask(TASK, 'Ship it')]);
    await loadTaskDetailsStore(asyncStorage);
    const renderer = await renderNote();
    await act(async () =>
      byLabel(renderer, 'Details for Ship it').props.onPress(),
    );

    act(() =>
      byLabel(renderer, 'Description of Ship it').props.onChangeText(
        'Ask **Sam** first',
      ),
    );
    await vi.waitFor(
      () =>
        expect(server.state.taskStore.get(TASK)!.description).toBe(
          'Ask **Sam** first',
        ),
      { timeout: 3_000 },
    );
    expect(server.state.store.get(NOTE)!.bodyMarkdown).toBe(`{{task:${TASK}}}`);
  });

  it('changes priority, deadline and tags from the chips, and the row follows', async () => {
    serve([makeNote(NOTE, `{{task:${TASK}}}`)], [makeTask(TASK, 'Ship it')]);
    await loadTaskDetailsStore(asyncStorage);
    const renderer = await renderNote();
    await act(async () =>
      byLabel(renderer, 'Details for Ship it').props.onPress(),
    );

    await act(async () =>
      byLabel(renderer, 'Priority: Medium priority').props.onPress(),
    );
    await pick('High priority');
    await settle(10);
    expect(server.state.taskStore.get(TASK)!.priority).toBe('high');
    expect(allText(renderer)).toContain('High');

    await act(async () => byLabel(renderer, 'Due: none').props.onPress());
    await pick('Tomorrow');
    await settle(10);
    expect(server.state.taskStore.get(TASK)!.dueDate).toBe('2026-10-03');

    await act(async () => byLabel(renderer, 'Add tags').props.onPress());
    const [, , save] = vi.mocked(Alert.prompt).mock.lastCall!;
    await act(async () => (save as (text: string) => void)('ops, q4'));
    await settle(10);
    expect(server.state.taskStore.get(TASK)!.tags).toEqual(['ops', 'q4']);
    expect(byLabel(renderer, 'Tags: ops, q4')).toBeTruthy();
  });

  it('completes the task from the Status chip', async () => {
    serve([makeNote(NOTE, `{{task:${TASK}}}`)], [makeTask(TASK, 'Ship it')]);
    await loadTaskDetailsStore(asyncStorage);
    const renderer = await renderNote();
    await act(async () =>
      byLabel(renderer, 'Details for Ship it').props.onPress(),
    );
    await act(async () => byLabel(renderer, 'Status: To do').props.onPress());
    await pick('Done');
    await settle(10);
    expect(server.state.taskStore.get(TASK)!.status).toBe('done');
    expect(byLabel(renderer, 'Reopen Ship it')).toBeTruthy();
  });

  it('shows each task’s first details line when the note peeks, and remembers it', async () => {
    serve(
      [makeNote(NOTE, `{{task:${TASK}}}`)],
      [makeTask(TASK, 'Ship it', { description: '\n**Ask** Sam\nThen ship' })],
    );
    await loadTaskDetailsStore(asyncStorage);
    const renderer = await renderNote();
    expect(allText(renderer)).not.toContain('Ask Sam');

    await act(async () => byLabel(renderer, 'Note actions').props.onPress());
    await pick('Task rows…');
    await pick('Title and first line');
    expect(allText(renderer)).toContain('Ask Sam');
    expect(allText(renderer)).not.toContain('Then ship');
    expect(asyncStorage.data.get(TASK_PEEK_NOTES_KEY)).toBe(
      JSON.stringify([NOTE]),
    );
  });

  it('restores open details and peek from storage', async () => {
    serve(
      [makeNote(NOTE, `{{task:${TASK}}}`)],
      [makeTask(TASK, 'Ship it', { description: 'Check the logs' })],
    );
    await asyncStorage.setItem(TASK_DETAILS_OPEN_KEY, JSON.stringify([TASK]));
    await asyncStorage.setItem(TASK_PEEK_NOTES_KEY, JSON.stringify([NOTE]));
    await loadTaskDetailsStore(asyncStorage);
    const renderer = await renderNote();
    expect(byLabel(renderer, 'Description of Ship it').props.value).toBe(
      'Check the logs',
    );
  });
});
