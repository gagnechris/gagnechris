import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import type { Extension } from '@codemirror/state';
import {
  EditorView,
  keymap as cmKeymap,
  type KeyBinding,
} from '@codemirror/view';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';

export type MarkdownEditorHandle = {
  focus: () => void;
  insertText: (text: string) => void;
};

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the editor surface. */
  label?: string;
  readOnly?: boolean;
  /**
   * Upload image files from paste/drop; return public paths like `/media/...`.
   * When omitted, paste/drop of images is ignored.
   */
  onUploadImages?: (files: File[]) => Promise<string[]>;
  /**
   * Extra CodeMirror extensions (merged after built-ins).
   * Memoize this array (and `keymap`) — a new reference reconfigures CodeMirror
   * on every render and can reset scroll/selection.
   * Opt-in task checkboxes: `extensions={[taskListToggle()]}`.
   */
  extensions?: Extension[];
  /** Extra key bindings (higher precedence than defaults). Memoize like `extensions`. */
  keymap?: readonly KeyBinding[];
  /** Show line numbers in the gutter. @default true */
  lineNumbers?: boolean;
  /** Placeholder when the document is empty. */
  placeholder?: string;
  onBlur?: () => void;
};

function imageFilesFromList(
  list: FileList | DataTransferItemList | null,
): File[] {
  if (!list) return [];
  const files: File[] = [];
  if (list instanceof FileList) {
    for (const file of Array.from(list)) {
      if (file.type.startsWith('image/')) files.push(file);
    }
    return files;
  }
  for (const item of Array.from(list)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

function insertMarkdownAtCursor(view: EditorView, markdownSnippets: string[]) {
  if (markdownSnippets.length === 0) return;
  const insert = markdownSnippets.join('\n\n');
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: `${insert}\n\n` },
    selection: { anchor: from + insert.length + 2 },
  });
}

/**
 * Reusable markdown source editor (CodeMirror 6). Notebook can reuse this.
 */
const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      value,
      onChange,
      label = 'Markdown',
      readOnly = false,
      onUploadImages,
      extensions: extraExtensions,
      keymap: extraKeymap,
      lineNumbers = true,
      placeholder,
      onBlur,
    },
    ref,
  ) {
    const cmRef = useRef<ReactCodeMirrorRef>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        cmRef.current?.view?.focus();
      },
      insertText: (text: string) => {
        const view = cmRef.current?.view;
        if (!view || view.state.readOnly) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
      },
    }));

    const extensions = useMemo(() => {
      const base: Extension[] = [markdown(), EditorView.lineWrapping];
      if (extraKeymap && extraKeymap.length > 0) {
        base.push(cmKeymap.of(extraKeymap));
      }
      if (extraExtensions && extraExtensions.length > 0) {
        base.push(...extraExtensions);
      }
      if (!onUploadImages || readOnly) {
        return base;
      }
      const handlers = EditorView.domEventHandlers({
        paste(event, view) {
          const files = imageFilesFromList(event.clipboardData?.items ?? null);
          if (files.length === 0) return false;
          event.preventDefault();
          void onUploadImages(files).then((paths) => {
            insertMarkdownAtCursor(
              view,
              paths.map((path) => `![image](${path})`),
            );
          });
          return true;
        },
        drop(event, view) {
          const files = imageFilesFromList(event.dataTransfer?.files ?? null);
          if (files.length === 0) return false;
          event.preventDefault();
          void onUploadImages(files).then((paths) => {
            insertMarkdownAtCursor(
              view,
              paths.map((path, i) => {
                const name = files[i]?.name?.replace(/\.[^.]+$/, '') || 'image';
                return `![${name}](${path})`;
              }),
            );
          });
          return true;
        },
      });
      return [...base, handlers];
    }, [extraExtensions, extraKeymap, onUploadImages, readOnly]);

    return (
      <div className="markdown-editor" aria-label={label}>
        <CodeMirror
          ref={cmRef}
          value={value}
          height="100%"
          extensions={extensions}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          readOnly={readOnly}
          basicSetup={{
            lineNumbers,
            foldGutter: false,
            highlightActiveLine: true,
          }}
        />
      </div>
    );
  },
);

export default MarkdownEditor;
