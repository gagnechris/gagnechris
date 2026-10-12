import { createElement, useState, type ReactNode } from 'react';
import { act, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../test/render';
import {
  liveMarkdownDecorations,
  liveMarkdownHash,
} from './markdown/liveDecorations';
import {
  LiveMarkdownInput,
  type LiveMarkdownHandle,
} from './ui/LiveMarkdownInput';

vi.mock('../modules/live-markdown', () => ({
  LiveMarkdownNativeView: ({ children, ...props }: { children?: ReactNode }) =>
    createElement('LiveMarkdownNative', props, children),
}));

const native = (renderer: ReactTestRenderer) =>
  renderer.root.find((node) => (node.type as string) === 'LiveMarkdownNative');

const event = <T,>(nativeEvent: T) => ({ nativeEvent });

const Editor = ({
  initial,
  handle,
  onText,
}: {
  initial: string;
  handle: { current: LiveMarkdownHandle | null };
  onText?: (text: string) => void;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <LiveMarkdownInput
      ref={handle}
      variant="reading"
      resolveImage={(src) => `https://example.com${src}`}
      accessibilityLabel="Body"
      value={value}
      onChangeText={(text) => {
        setValue(text);
        onText?.(text);
      }}
    />
  );
};

describe('liveMarkdownDecorations', () => {
  it('hashes UTF-16 code units the way the native view does', () => {
    expect(liveMarkdownHash('')).toBe(0);
    expect(liveMarkdownHash('ab')).toBe(97 * 31 + 98);
    // Wraps at 32 bits.
    expect(liveMarkdownHash('x'.repeat(40))).toBe(
      [...'x'.repeat(40)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0),
    );
  });

  it('sends each line, with image lines resolved', () => {
    const json = JSON.parse(
      liveMarkdownDecorations('# Hi\n![a](/m.jpg)', (src) => `https://x${src}`),
    );
    expect(json).toEqual({
      hash: liveMarkdownHash('# Hi\n![a](/m.jpg)'),
      lines: [
        { style: 'h1', marks: [{ f: 0, t: 2, k: 'hide' }] },
        { image: { f: 0, t: 12, src: 'https://x/m.jpg' } },
      ],
    });
  });
});

describe('LiveMarkdownInput on the native view', () => {
  it('passes the text with its decorations and labels the text view', async () => {
    const handle = { current: null };
    const renderer = await render(<Editor initial="**a**" handle={handle} />);
    const view = native(renderer);
    expect(view.props.value).toBe('**a**');
    expect(view.props.textLabel).toBe('Body');
    expect(JSON.parse(view.props.decorations).hash).toBe(
      liveMarkdownHash('**a**'),
    );
    expect(JSON.parse(view.props.theme).body.font).toBe('Newsreader-Regular');
  });

  it('echoes the native event count with the text it reported', async () => {
    const handle = { current: null };
    const onText = vi.fn();
    const renderer = await render(
      <Editor initial="" handle={handle} onText={onText} />,
    );
    act(() =>
      native(renderer).props.onChangeText(event({ text: 'ab', eventCount: 2 })),
    );
    expect(onText).toHaveBeenCalledWith('ab');
    expect(native(renderer).props).toMatchObject({
      value: 'ab',
      mostRecentEventCount: 2,
    });
    expect(JSON.parse(native(renderer).props.decorations).hash).toBe(
      liveMarkdownHash('ab'),
    );
  });

  it('turns focus and selection calls into requests the view applies once', async () => {
    const handle = { current: null as LiveMarkdownHandle | null };
    const renderer = await render(<Editor initial="hello" handle={handle} />);
    act(() => {
      handle.current!.focus();
      handle.current!.setSelection(1, 3);
    });
    expect(native(renderer).props.focusRequest).toBe(1);
    expect(native(renderer).props.selectionRequest).toEqual([1, 1, 3]);
    act(() => handle.current!.setSelection(2, 2));
    expect(native(renderer).props.selectionRequest).toEqual([2, 2, 2]);

    expect(handle.current!.isFocused()).toBe(false);
    act(() => native(renderer).props.onFocusChange(event({ focused: true })));
    expect(handle.current!.isFocused()).toBe(true);
  });

  it('grows to the height the view reports', async () => {
    const handle = { current: null };
    const renderer = await render(<Editor initial="a" handle={handle} />);
    act(() => native(renderer).props.onContentHeight(event({ height: 140 })));
    expect(native(renderer).props.style).toEqual([{ height: 140 }, undefined]);
  });
});
