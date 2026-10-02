import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Prec, type Extension } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  keymap as cmKeymap,
  lineNumbers as lineNumbersExt,
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
      // Plaintext CodeMirror (no @codemirror/lang-markdown / @lezer/markdown —
      // that package alone is ~550 kB minified). Preview pane still renders
      // markdown; keeping the shared editor chunk under 500 kB (CHR-178).
      const base: Extension[] = [
        history(),
        EditorView.lineWrapping,
        highlightActiveLine(),
        cmKeymap.of([...defaultKeymap, ...historyKeymap]),
        // Accessible name on the real textbox (.cm-content), not only the wrapper.
        EditorView.contentAttributes.of({ 'aria-label': label }),
        // ⌘⏎ / Ctrl+Enter: no-op in the body (shell skips publish; consume so
        // CodeMirror's insertBlankLine does not add a newline) — CHR-178.
        Prec.highest(
          cmKeymap.of([
            {
              key: 'Mod-Enter',
              run: () => true,
            },
          ]),
        ),
      ];
      if (lineNumbers) {
        base.push(lineNumbersExt());
      }
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
    }, [
      extraExtensions,
      extraKeymap,
      label,
      lineNumbers,
      onUploadImages,
      readOnly,
    ]);

    return (
      <div className="markdown-editor">
        <CodeMirror
          ref={cmRef}
          value={value}
          height="100%"
          extensions={extensions}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          readOnly={readOnly}
          basicSetup={false}
        />
      </div>
    );
  },
);

export default MarkdownEditor;
