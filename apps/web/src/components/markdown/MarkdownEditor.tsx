import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { useMemo } from 'react'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  /** Accessible name for the editor surface. */
  label?: string
  readOnly?: boolean
  /**
   * Upload image files from paste/drop; return public paths like `/media/...`.
   * When omitted, paste/drop of images is ignored.
   */
  onUploadImages?: (files: File[]) => Promise<string[]>
}

function imageFilesFromList(list: FileList | DataTransferItemList | null): File[] {
  if (!list) return []
  const files: File[] = []
  if (list instanceof FileList) {
    for (const file of Array.from(list)) {
      if (file.type.startsWith('image/')) files.push(file)
    }
    return files
  }
  for (const item of Array.from(list)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

function insertMarkdownAtCursor(view: EditorView, markdownSnippets: string[]) {
  if (markdownSnippets.length === 0) return
  const insert = markdownSnippets.join('\n\n')
  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert: `${insert}\n\n` },
    selection: { anchor: from + insert.length + 2 },
  })
}

/**
 * Reusable markdown source editor (CodeMirror 6). Notebook can reuse this.
 */
export default function MarkdownEditor({
  value,
  onChange,
  label = 'Markdown',
  readOnly = false,
  onUploadImages,
}: MarkdownEditorProps) {
  const extensions = useMemo(() => {
    const base = [markdown(), EditorView.lineWrapping]
    if (!onUploadImages || readOnly) {
      return base
    }
    const handlers = EditorView.domEventHandlers({
      paste(event, view) {
        const files = imageFilesFromList(event.clipboardData?.items ?? null)
        if (files.length === 0) return false
        event.preventDefault()
        void onUploadImages(files).then((paths) => {
          insertMarkdownAtCursor(
            view,
            paths.map((path) => `![image](${path})`),
          )
        })
        return true
      },
      drop(event, view) {
        const files = imageFilesFromList(event.dataTransfer?.files ?? null)
        if (files.length === 0) return false
        event.preventDefault()
        void onUploadImages(files).then((paths) => {
          insertMarkdownAtCursor(
            view,
            paths.map((path, i) => {
              const name = files[i]?.name?.replace(/\.[^.]+$/, '') || 'image'
              return `![${name}](${path})`
            }),
          )
        })
        return true
      },
    })
    return [...base, handlers]
  }, [onUploadImages, readOnly])

  return (
    <div className="markdown-editor" aria-label={label}>
      <CodeMirror
        value={value}
        height="100%"
        extensions={extensions}
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
