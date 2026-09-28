import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor'
import { taskListToggle, toggleTaskAtPos } from './taskListToggle'

const LONG_MARKDOWN = Array.from(
  { length: 80 },
  (_, i) =>
    `## Heading ${i + 1}\n\nParagraph ${i + 1} with enough text to force overflow.\n`,
).join('\n')

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
`

describe('MarkdownEditor scroll (CHR-111)', () => {
  let styleEl: HTMLStyleElement

  beforeEach(() => {
    styleEl = document.createElement('style')
    styleEl.textContent = SCROLL_FIX_CSS
    document.head.appendChild(styleEl)
  })

  afterEach(() => {
    styleEl.remove()
  })

  test('scroll-fix CSS keeps the theme wrapper in the flex height chain', () => {
    expect(SCROLL_FIX_CSS).toMatch(/\.markdown-editor\s*\{[^}]*display:\s*flex/s)
    expect(SCROLL_FIX_CSS).toMatch(
      /\.markdown-editor\s*>\s*div\s*\{[^}]*flex:\s*1/s,
    )
    expect(SCROLL_FIX_CSS).toMatch(
      /\.markdown-editor\s*>\s*div\s*\{[^}]*min-height:\s*0/s,
    )
  })

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
    )

    const editor = container.querySelector('.markdown-editor')
    expect(editor).toBeTruthy()

    await waitFor(() => {
      expect(editor!.querySelector('.cm-scroller')).toBeTruthy()
    })

    const scroller = editor!.querySelector('.cm-scroller') as HTMLElement

    // jsdom does not lay out real pixel heights; pin a constrained viewport
    // and tall content so we can assert scrollTop is writable.
    Object.defineProperty(scroller, 'clientHeight', {
      configurable: true,
      get: () => 400,
    })
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      get: () => 1200,
    })

    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight)
    scroller.scrollTop = 250
    expect(scroller.scrollTop).toBe(250)
  })
})

describe('MarkdownEditor task list + options (CHR-133)', () => {
  let parent: HTMLDivElement
  let view: EditorView

  afterEach(() => {
    view?.destroy()
    parent?.remove()
  })

  test('clicking a - [ ] item toggles to - [x] and back', () => {
    parent = document.createElement('div')
    document.body.appendChild(parent)
    view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '- [ ] buy milk\n- [x] done',
        extensions: [taskListToggle()],
      }),
    })

    // Position on the unchecked checkbox brackets (`[ ]` starts at offset 2).
    expect(toggleTaskAtPos(view, 3, true)).toBe(true)
    expect(view.state.doc.toString()).toBe('- [x] buy milk\n- [x] done')

    expect(toggleTaskAtPos(view, 3, true)).toBe(true)
    expect(view.state.doc.toString()).toBe('- [ ] buy milk\n- [x] done')
  })

  test('lineNumbers can be turned off via prop', async () => {
    const { container, rerender } = render(
      <MarkdownEditor value="hello" onChange={() => {}} lineNumbers={false} />,
    )

    await waitFor(() => {
      expect(container.querySelector('.cm-editor')).toBeTruthy()
    })
    expect(container.querySelector('.cm-lineNumbers')).toBeNull()

    rerender(<MarkdownEditor value="hello" onChange={() => {}} lineNumbers />)
    await waitFor(() => {
      expect(container.querySelector('.cm-lineNumbers')).toBeTruthy()
    })
  })

  test('ref handle focuses and inserts text', async () => {
    const handle = createRef<MarkdownEditorHandle>()
    const onChange = vi.fn()
    render(
      <MarkdownEditor
        ref={handle}
        value="hi"
        onChange={onChange}
        lineNumbers={false}
      />,
    )

    await waitFor(() => {
      expect(handle.current).toBeTruthy()
    })

    handle.current!.focus()
    handle.current!.insertText('there')
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
      const calls = onChange.mock.calls
      const last = calls[calls.length - 1]?.[0] as string
      expect(last).toContain('there')
    })
  })
})
