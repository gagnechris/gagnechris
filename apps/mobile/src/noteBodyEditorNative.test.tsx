import type {
  TaskEmbedCreate,
  useNoteTaskEmbedSync,
} from '@gagnechris/app-core';
import { createElement, useState, type ReactNode } from 'react';
import {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../test/render';
import { NoteBodyEditor } from './notebook/NoteBodyEditor';

vi.mock('../modules/live-markdown', () => ({
  LiveMarkdownNativeView: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('LiveMarkdownNative', props, children),
}));

const Harness = ({
  initial,
  creates,
  onMarkdown,
  newId,
}: {
  initial: string;
  creates: TaskEmbedCreate[];
  onMarkdown: (markdown: string) => void;
  newId: () => string;
}) => {
  const [value, setValue] = useState(initial);
  const embeds = {
    onCreate: (create: TaskEmbedCreate) => creates.push(create),
    onRemoved: () => {},
    error: null,
    stateOf: () => ({ kind: 'loading' as const }),
  } as unknown as ReturnType<typeof useNoteTaskEmbedSync>;
  return (
    <NoteBodyEditor
      markdown={value}
      onChange={(next) => {
        onMarkdown(next);
        setValue(next);
      }}
      embeds={embeds}
      today="2026-10-02"
      onOpenTask={() => {}}
      newId={newId}
    />
  );
};

const setup = async (initial: string) => {
  const creates: TaskEmbedCreate[] = [];
  const markdown = { current: initial };
  let n = 0;
  const newId = () => `01TASK${String((n += 1)).padStart(20, '0')}`;
  const renderer = await render(
    <Harness
      initial={initial}
      creates={creates}
      onMarkdown={(next) => (markdown.current = next)}
      newId={newId}
    />,
  );
  return { renderer, creates, markdown };
};

const lastView = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAll((node) => (node.type as string) === 'LiveMarkdownNative')
    .at(-1)!;

const event = <T,>(nativeEvent: T) => ({ nativeEvent });

let eventCount = 0;

/** A tap: UIKit reports the caret alone. */
const tap = (renderer: ReactTestRenderer, at: number) =>
  act(() => {
    const view = lastView(renderer);
    view.props.onFocusChange(event({ focused: true }));
    view.props.onSelectionChange(event({ selection: { start: at, end: at } }));
  });

/**
 * A keystroke as the native view sends it: the caret, then the text, which
 * React renders together.
 */
const keystroke = (renderer: ReactTestRenderer, text: string, at: number) =>
  act(() => {
    const view = lastView(renderer);
    const selection = { start: at, end: at };
    view.props.onSelectionChange(event({ selection }));
    eventCount += 1;
    view.props.onChangeText(event({ text, eventCount, selection }));
  });

/** Types `typed` at `at` in the last text run, a key at a time. */
const typeAt = (
  renderer: ReactTestRenderer,
  start: string,
  at: number,
  typed: string,
) => {
  let text = start;
  let caret = at;
  for (const char of typed) {
    text = text.slice(0, caret) + char + text.slice(caret);
    caret += 1;
    keystroke(renderer, text, caret);
  }
};

const pause = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 450)));

const press = (
  renderer: ReactTestRenderer,
  view: ReactTestInstance,
  label: string,
) =>
  act(() =>
    renderer.root
      .find(
        (node) =>
          (node.type as string) === 'InputAccessoryView' &&
          node.props.nativeID === view.props.inputAccessoryViewID,
      )
      .find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === label,
      )
      .props.onPress(),
  );

describe('note body on the live-preview view', () => {
  it('turns a task line into a task when the caret moves off it', async () => {
    const { renderer, creates, markdown } = await setup('Intro\n');
    tap(renderer, 6);
    typeAt(renderer, 'Intro\n', 6, '[ ] Call Sam');
    tap(renderer, 2);
    await pause();

    expect(creates.map((c) => c.draft.title)).toEqual(['Call Sam']);
    expect(markdown.current).toBe(`Intro\n{{task:${creates[0]!.id}}}`);
  });

  it('turns a task line into a task when Hide keyboard is pressed', async () => {
    const { renderer, creates } = await setup('');
    tap(renderer, 0);
    typeAt(renderer, '', 0, '[ ] Call Sam');
    const view = lastView(renderer);

    press(renderer, view, 'Hide keyboard');
    expect(lastView(renderer).props.blurRequest).toBe(1);
    act(() =>
      lastView(renderer).props.onFocusChange(event({ focused: false })),
    );

    expect(creates.map((c) => c.draft.title)).toEqual(['Call Sam']);
  });

  it('marks the caret line with Task after the line above became a task', async () => {
    const { renderer, creates, markdown } = await setup('\nthird');
    tap(renderer, 0);
    typeAt(renderer, '\nthird', 0, '[ ] four\n');
    await pause();
    expect(creates).toHaveLength(1);
    const view = lastView(renderer);
    expect(view.props.value).toBe('\nthird');
    expect(view.props.selectionRequest?.slice(1)).toEqual([0, 0]);

    press(renderer, view, 'Task');
    expect(markdown.current).toBe(`{{task:${creates[0]!.id}}}\n[ ] \nthird`);
  });
});
