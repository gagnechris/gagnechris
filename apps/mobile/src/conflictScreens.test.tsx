import { clearPendingFlushes } from '@gagnechris/app-core';
import { Alert } from 'react-native';
import {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteScreen from '../app/(tabs)/notes/[id]';
import TaskScreen from '../app/(tabs)/tasks/[id]';
import ConflictsScreen from '../app/conflicts';
import { databases } from '../test/expoSqlite';
import { makeNote, makeTask, notebookServer } from '../test/notebookServer';
import {
  allText,
  byLabel,
  Providers,
  render,
  settle,
  textOf,
} from '../test/render';
import { router, searchParams } from '../test/router';
import { NetworkStatus } from './net';
import { outboxConflicts, stopOutbox } from './outbox';

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
});

afterEach(async () => {
  act(() => mounted?.unmount());
  mounted = null;
  await stopOutbox();
  databases.clear();
  clearPendingFlushes();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const open = async (screen: React.ReactNode) => {
  mounted = await render(<Providers outbox>{screen}</Providers>);
  await settle(10);
  return mounted;
};

const input = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.find(
    (node) =>
      (node.type as string) === 'TextInput' &&
      node.props.accessibilityLabel === label,
  );

const allTextOf = (node: ReactTestInstance) =>
  node
    .findAllByType('Text' as never)
    .map(textOf)
    .join('\n');

const waitForConflict = (renderer: ReactTestRenderer, text: string) =>
  vi.waitFor(() => expect(allText(renderer)).toContain(text), {
    timeout: 3_000,
  });

describe('a note changed on two devices', () => {
  beforeEach(async () => {
    serve([makeNote(NOTE, 'shared text')]);
    searchParams.current = { id: NOTE };
  });

  const conflict = async () => {
    const renderer = await open(<NoteScreen />);
    server.editNote(NOTE, { bodyMarkdown: 'web text' });
    act(() => input(renderer, 'Note body').props.onChangeText('phone text'));
    await waitForConflict(renderer, 'Changed on another device (text)');
    return renderer;
  };

  it('shows their text and keeps theirs on request', async () => {
    const renderer = await conflict();
    expect(allText(renderer)).toContain('web text');
    expect(input(renderer, 'Note body').props.value).toBe('phone text');

    await act(async () => byLabel(renderer, 'Keep theirs').props.onPress());
    await settle(10);
    expect(allText(renderer)).not.toContain('Changed on another device');
    expect(input(renderer, 'Note body').props.value).toBe('web text');
    expect(server.state.store.get(NOTE)?.bodyMarkdown).toBe('web text');
  });

  it('sends the phone’s text over theirs', async () => {
    const renderer = await conflict();
    await act(async () => byLabel(renderer, 'Keep mine').props.onPress());
    await vi.waitFor(() =>
      expect(server.state.store.get(NOTE)?.bodyMarkdown).toBe('phone text'),
    );
    await settle(10);
    expect(input(renderer, 'Note body').props.value).toBe('phone text');
    expect(outboxConflicts()).toEqual([]);
  });

  it('saves the phone’s text as a new page', async () => {
    const renderer = await conflict();
    await act(async () =>
      byLabel(renderer, 'Save mine as a new page').props.onPress(),
    );
    await settle(10);
    const target = vi.mocked(router.replace).mock.calls[0]?.[0] as string;
    const id = target.replace('/notes/', '');
    expect(server.state.store.get(id)).toMatchObject({
      type: 'page',
      bodyMarkdown: 'phone text',
    });
    expect(server.state.store.get(NOTE)?.bodyMarkdown).toBe('web text');
  });
});

describe('a task deleted on another device', () => {
  beforeEach(() => {
    serve([], [makeTask(TASK, 'Call back')]);
    searchParams.current = { id: TASK };
  });

  it('restores the phone’s copy as a new task', async () => {
    const renderer = await open(<TaskScreen />);
    server.deleteTask(TASK);
    act(() => input(renderer, 'Title').props.onChangeText('Call back Sam'));
    await waitForConflict(renderer, 'Deleted on another device');

    await act(async () =>
      byLabel(renderer, 'Restore as a new task').props.onPress(),
    );
    await settle(10);
    const target = vi.mocked(router.replace).mock.calls[0]?.[0] as string;
    expect(target).toMatch(/^\/tasks\//);
    expect(
      server.state.taskStore.get(target.replace('/tasks/', '')),
    ).toMatchObject({ title: 'Call back Sam', deleted: false });
  });
});

describe('the conflicts list', () => {
  it('opens from the sync banner and settles each conflict there', async () => {
    serve([makeNote(NOTE, 'shared text')]);
    searchParams.current = { id: NOTE };
    const renderer = await open(
      <>
        <NetworkStatus />
        <NoteScreen />
      </>,
    );
    server.editNote(NOTE, { title: 'Web title' });
    act(() => input(renderer, 'Title').props.onChangeText('Phone title'));
    await waitForConflict(renderer, "1 edit couldn't sync · Review");
    act(() =>
      renderer.root
        .find((node) => node.props.testID === 'failed-edits')
        .props.onPress(),
    );
    expect(router.push).toHaveBeenCalledWith('/conflicts');
  });

  it('lists each conflict with its choices', async () => {
    serve([makeNote(NOTE, 'shared text')]);
    searchParams.current = { id: NOTE };
    const renderer = await open(
      <>
        <NoteScreen />
        <ConflictsScreen />
      </>,
    );
    server.editNote(NOTE, { title: 'Web title' });
    act(() => input(renderer, 'Title').props.onChangeText('Phone title'));
    await waitForConflict(renderer, 'Changed on another device (title)');
    const list = renderer.root.find(
      (node) =>
        (node.type as string) === 'ScrollView' &&
        node.props.contentContainerStyle?.padding !== undefined &&
        allTextOf(node).includes('Phone title'),
    );
    expect(allTextOf(list)).toContain('Changed on another device (title)');
    const keepMine = list.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'Keep mine',
    );
    await act(async () => keepMine.props.onPress());
    await settle(10);
    expect(server.state.store.get(NOTE)?.title).toBe('Phone title');
    expect(allText(renderer)).toContain('Everything is synced.');
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
