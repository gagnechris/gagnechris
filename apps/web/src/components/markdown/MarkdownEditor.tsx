import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  /** Accessible name for the editor surface. */
  label?: string
  readOnly?: boolean
}

/**
 * Reusable markdown source editor (CodeMirror 6). Notebook can reuse this.
 */
export default function MarkdownEditor({
  value,
  onChange,
  label = 'Markdown',
  readOnly = false,
}: MarkdownEditorProps) {
  return (
    <div className="markdown-editor" aria-label={label}>
      <CodeMirror
        value={value}
        height="100%"
        extensions={[markdown(), EditorView.lineWrapping]}
        onChange={onChange}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
        }}
      />
    </div>
  )
}
