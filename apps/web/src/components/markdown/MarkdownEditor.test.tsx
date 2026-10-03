import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor';
import { taskListToggle } from './taskListToggle';

const LONG_MARKDOWN = Array.from(
  { length: 80 },
  (_, i) =>
    `## Heading ${i + 1}\n\nParagraph ${i + 1} with enough text to force overflow.\n`,
).join('\n');

/**
 * CHR-111 fix: CodeMirror's theme wrapper must fill the fixed pane so
 * `.cm-scroller` scrolls instead of growing to content height.
 * Kept in sync with `markdown.css` (asserted below).
 */
const SCROLL_FIX_CSS = `
.markdown-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 18rem;
  overflow: hidden;
}
.markdown-editor > div {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.markdown-editor .cm-editor {
  height: 100%;
  flex: 1;
  min-height: 0;
}
.markdown-split > .markdown-editor,
.markdown-split > .markdown-preview {
  min-height: 0;
  height: min(70vh, 40rem);
}
`;

/** Fire a real Space keydown through CodeMirror's keymap (CHR-165). */
function typeSpace(view: EditorView) {
  view.focus();
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Fire ⌘⏎ / Ctrl+Enter through CodeMirror's keymap (CHR-178). */
function pressModEnter(
  view: EditorView,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean },
) {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    ...modifiers,
    bubbles: true,
    cancelable: true,
  });
  view.contentDOM.dispatchEvent(event);
  return event;
}

describe('MarkdownEditor scroll (CHR-111)', () => {
  let styleEl: HTMLStyleElement;

  beforeEach(() => {
    styleEl = document.createElement('style');
    styleEl.textContent = SCROLL_FIX_CSS;
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    styleEl.remove();
  });

  test('scroll-fix CSS keeps the theme wrapper in the flex height chain', () => {
    expect(SCROLL_FIX_CSS).toMatch(
      /\.markdown-editor\s*\{[^}]*display:\s*flex/s,
    );
    expect(SCROLL_FIX_CSS).toMatch(
      /\.markdown-editor\s*>\s*div\s*\{[^}]*flex:\s*1/s,
    );
    expect(SCROLL_FIX_CSS).toMatch(
      /\.markdown-editor\s*>\s*div\s*\{[^}]*min-height:\s*0/s,
    );
  });

  test('long content leaves .cm-scroller scrollable (scrollTop is writable)', async () => {
    const { container } = render(
      <div className="markdown-workspace" style={{ width: 960 }}>
        <div className="markdown-split" data-pane="edit">
          <MarkdownEditor value={LONG_MARKDOWN} onChange={() => {}} />
          <div className="markdown-preview" aria-hidden>
            preview
          </div>
        </div>
      </div>,
    );

    const editor = container.querySelector('.markdown-editor');
    expect(editor).toBeTruthy();

    await waitFor(() => {
      expect(editor!.querySelector('.cm-scroller')).toBeTruthy();
    });

    const scroller = editor!.querySelector('.cm-scroller') as HTMLElement;

    // jsdom does not lay out real pixel heights; pin a constrained viewport
    // and tall content so we can assert scrollTop is writable.
    Object.defineProperty(scroller, 'clientHeight', {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      get: () => 1200,
    });

    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    scroller.scrollTop = 250;
    expect(scroller.scrollTop).toBe(250);
  });
});

describe('MarkdownEditor task list + options (CHR-133 / CHR-148)', () => {
  let parent: HTMLDivElement;
  let view: EditorView;

  afterEach(() => {
    view?.destroy();
    parent?.remove();
  });

  test('Space strictly inside [ ] toggles; Space after ] does not (CHR-148)', () => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '- [ ] buy milk',
        extensions: [taskListToggle()],
      }),
    });

    // `[ ]` is at offsets 2..5; cursor after `]` is at 5 — Space must not toggle.
    view.dispatch({ selection: EditorSelection.cursor(5) });
    typeSpace(view);
    expect(view.state.doc.toString()).toBe('- [ ] buy milk');

    // Cursor between brackets (offset 3) — Space toggles via the keymap.
    view.dispatch({ selection: EditorSelection.cursor(3) });
    typeSpace(view);
    expect(view.state.doc.toString()).toBe('- [x] buy milk');
  });

  test('does not treat markdown links - [x](url) as task checkboxes', () => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '- [x](https://example.com)',
        extensions: [taskListToggle()],
      }),
    });
    view.dispatch({ selection: EditorSelection.cursor(3) });
    typeSpace(view);
    expect(view.state.doc.toString()).toBe('- [x](https://example.com)');
  });

  test('mousedown on the checkbox runs the real handler (CHR-148)', () => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '- [ ] buy milk',
        extensions: [taskListToggle()],
      }),
    });

    // jsdom lacks layout; stub hit-testing so the real mousedown handler runs.
    vi.spyOn(view, 'posAtCoords').mockReturnValue(3);
    const event = new MouseEvent('mousedown', {
      button: 0,
      clientX: 12,
      clientY: 12,
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(event);
    expect(view.state.doc.toString()).toBe('- [x] buy milk');
  });

  test('blog MarkdownEditor does not enable taskListToggle by default', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <MarkdownEditor value="- [ ] buy milk" onChange={onChange} />,
    );
    await waitFor(() => {
      expect(container.querySelector('.cm-editor')).toBeTruthy();
    });

    // Drive CodeMirror view directly (same as the toggle-on test) so a
    // caret-at-0 Space cannot falsely pass (CHR-178).
    const cmView = EditorView.findFromDOM(
      container.querySelector('.cm-content')!,
    );
    expect(cmView).toBeTruthy();
    cmView!.dispatch({ selection: EditorSelection.cursor(3) });
    typeSpace(cmView!);
    expect(cmView!.state.doc.toString()).toBe('- [ ] buy milk');
    expect(onChange.mock.calls.some(([v]) => String(v).includes('- [x]'))).toBe(
      false,
    );
  });

  test('⌘⏎ / Ctrl+Enter does not insert a blank line (CHR-178)', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <MarkdownEditor value="hello" onChange={onChange} />,
    );
    await waitFor(() => {
      expect(container.querySelector('.cm-content')).toBeTruthy();
    });
    const cmView = EditorView.findFromDOM(
      container.querySelector('.cm-content')!,
    )!;
    cmView.focus();
    cmView.dispatch({ selection: EditorSelection.cursor(5) });
    // CodeMirror maps `Mod` to Meta on macOS and Ctrl elsewhere (jsdom is not
    // macOS), so send both. A metaKey-only event never reaches `Mod-Enter`
    // here, which made the previous version of this test pass vacuously.
    const modEnter = pressModEnter(cmView, { ctrlKey: true });
    pressModEnter(cmView, { metaKey: true });
    // Handled (consumed) by our Mod-Enter binding, not insertBlankLine.
    expect(modEnter.defaultPrevented).toBe(true);
    expect(cmView.state.doc.toString()).toBe('hello');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('textbox has an accessible name via contentAttributes (CHR-178)', async () => {
    const { container } = render(
      <MarkdownEditor value="x" onChange={() => {}} label="Post body" />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: 'Post body' }),
      ).toBeInTheDocument();
    });
    // Wrapper must not be the only named node — the role=textbox is .cm-content.
    expect(container.querySelector('.cm-content')).toHaveAttribute(
      'aria-label',
      'Post body',
    );
  });

  test('lineNumbers can be turned off via prop', async () => {
    const { container, rerender } = render(
      <MarkdownEditor value="hello" onChange={() => {}} lineNumbers={false} />,
    );

    await waitFor(() => {
      expect(container.querySelector('.cm-editor')).toBeTruthy();
    });
    expect(container.querySelector('.cm-lineNumbers')).toBeNull();

    rerender(<MarkdownEditor value="hello" onChange={() => {}} lineNumbers />);
    await waitFor(() => {
      expect(container.querySelector('.cm-lineNumbers')).toBeTruthy();
    });
  });

  test('ref handle focuses and inserts text', async () => {
    const handle = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();
    render(
      <MarkdownEditor
        ref={handle}
        value="hi"
        onChange={onChange}
        lineNumbers={false}
      />,
    );

    await waitFor(() => {
      expect(handle.current).toBeTruthy();
    });

    handle.current!.focus();
    handle.current!.insertText('there');
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
      const calls = onChange.mock.calls;
      const last = calls[calls.length - 1]?.[0] as string;
      expect(last).toContain('there');
    });
  });
});
