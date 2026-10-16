import { openBrowserAsync } from 'expo-web-browser';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectAccessible } from '../test/accessible';
import { byLabel, render, textOf } from '../test/render';
import { TaskEmbedRow } from './ui/TaskEmbedRow';

afterEach(() => vi.clearAllMocks());

const TITLE =
  'Read https://example.com/a/long/article-path, then www.b.example';

const state = (title = TITLE) => ({
  kind: 'task' as const,
  task: { title, status: 'todo' as const, priority: 'med' as const },
  onToggle: () => undefined,
  onRename: vi.fn(),
});

const links = (renderer: ReactTestRenderer) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === 'string' && node.props.accessibilityRole === 'link',
  );

const opened = () => vi.mocked(openBrowserAsync).mock.calls.map(([url]) => url);

describe('URLs in a task title', () => {
  it('are links in a read-only title, opened in the in-app browser', async () => {
    const onOpen = vi.fn();
    const renderer = await render(
      <TaskEmbedRow state={state()} onOpen={onOpen} />,
    );
    const [first, second] = links(renderer);
    expect(first!.type).toBe('Text');
    expect(textOf(first!)).toBe('https://example.com/a/long/article-path');
    expect(textOf(second!)).toBe('www.b.example');
    act(() => first!.props.onPress());
    act(() => second!.props.onPress());
    expect(opened()).toEqual([
      'https://example.com/a/long/article-path',
      'https://www.b.example',
    ]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('are VoiceOver actions on a read-only row', async () => {
    const onMenu = vi.fn();
    const renderer = await render(
      <TaskEmbedRow state={state()} onOpen={() => undefined} onMenu={onMenu} />,
    );
    const row = renderer.root.find(
      (node) =>
        (node.type as string) === 'Pressable' &&
        node.props.accessibilityHint === 'Opens the task',
    );
    expect(row.props.accessibilityActions).toEqual([
      { name: 'menu', label: 'Task actions' },
      { name: 'link:0', label: 'Open example.com/…' },
      { name: 'link:1', label: 'Open www.b.example' },
    ]);
    act(() =>
      row.props.onAccessibilityAction({
        nativeEvent: { actionName: 'link:1' },
      }),
    );
    act(() =>
      row.props.onAccessibilityAction({ nativeEvent: { actionName: 'menu' } }),
    );
    expect(opened()).toEqual(['https://www.b.example']);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it('follow an editable title as shortened links', async () => {
    const renderer = await render(
      <TaskEmbedRow state={state()} editable onOpen={() => undefined} />,
    );
    expect(byLabel(renderer, 'Task title').props.value).toBe(TITLE);
    const chips = links(renderer);
    expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual([
      'example.com/…',
      'www.b.example',
    ]);
    act(() => chips[0]!.props.onPress());
    expect(opened()).toEqual(['https://example.com/a/long/article-path']);
    expectAccessible(renderer);
  });

  it('leave a title without URLs as plain text', async () => {
    const renderer = await render(
      <TaskEmbedRow state={state('Call mom.')} editable />,
    );
    expect(links(renderer)).toEqual([]);
  });
});
