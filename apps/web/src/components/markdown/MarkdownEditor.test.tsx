import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import MarkdownEditor from './MarkdownEditor'

const LONG_MARKDOWN = Array.from(
  { length: 80 },
  (_, i) =>
    `## Heading ${i + 1}\n\nParagraph ${i + 1} with enough text to force overflow.\n`,
).join('\n')

const cssPath = join(dirname(fileURLToPath(import.meta.url)), 'markdown.css')
const markdownCss = readFileSync(cssPath, 'utf8')

describe('MarkdownEditor scroll (CHR-111)', () => {
  let styleEl: HTMLStyleElement

  beforeEach(() => {
    styleEl = document.createElement('style')
    styleEl.textContent = markdownCss
    document.head.appendChild(styleEl)
  })

  afterEach(() => {
    styleEl.remove()
  })

  test('stylesheet keeps the CodeMirror theme wrapper in the flex height chain', () => {
    // Guard the CHR-111 fix: without these rules, .cm-scroller grows to content
    // height and .markdown-editor { overflow: hidden } clips unreachable lines.
    expect(markdownCss).toMatch(
      /\.markdown-editor\s*\{[^}]*display:\s*flex/s,
    )
    expect(markdownCss).toMatch(
      /\.markdown-editor\s*>\s*div\s*\{[^}]*flex:\s*1/s,
    )
    expect(markdownCss).toMatch(
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
