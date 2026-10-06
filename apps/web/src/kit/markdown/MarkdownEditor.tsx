import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  type Extension,
} from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  keymap as cmKeymap,
  lineNumbers as lineNumbersExt,
  placeholder as placeholderExt,
  type KeyBinding,
} from '@codemirror/view';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { continueMarkdownList } from './listContinuation';

export type MarkdownEditorHandle = {
  focus: () => void;
  insertText: (text: string) => void;
  view: () => EditorView | undefined;
};

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  readOnly?: boolean;
  /** Returns public paths like `/media/...`; when omitted, image paste/drop is ignored. */
  onUploadImages?: (files: File[]) => Promise<string[]>;
  /**
   * Memoize this array (and `keymap`): a new reference reconfigures CodeMirror
   * on every render and can reset scroll/selection.
   */
  extensions?: Extension[];
  /** Memoize like `extensions`. */
  keymap?: readonly KeyBinding[];
  /** @default true */
  lineNumbers?: boolean;
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

/** Marks a doc replace that came from the `value` prop, so it isn't echoed to `onChange`. */
const External = Annotation.define<boolean>();

/** A `value` that lags the doc this long after a keystroke is stale, not a reset. */
const TYPING_GRACE_MS = 200;

const fillPane = EditorView.theme({ '& .cm-scroller': { height: '100%' } });

function insertMarkdownAtCursor(view: EditorView, markdownSnippets: string[]) {
  if (markdownSnippets.length === 0) return;
  const insert = markdownSnippets.join('\n\n');
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: `${insert}\n\n` },
    selection: { anchor: from + insert.length + 2 },
  });
}

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
    const parentRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | undefined>(undefined);
    const config = useRef(new Compartment()).current;
    const callbacks = useRef({ onChange });
    const lastTyped = useRef(0);

    useImperativeHandle(ref, () => ({
      focus: () => {
        viewRef.current?.focus();
      },
      insertText: (text: string) => {
        const view = viewRef.current;
        if (!view || view.state.readOnly) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
      },
      view: () => viewRef.current,
    }));

    const extensions = useMemo(() => {
      // Plaintext CodeMirror: @codemirror/lang-markdown alone is ~550 kB
      // minified, and the shared editor chunk must stay under 500 kB.
      const base: Extension[] = [
        history(),
        EditorView.lineWrapping,
        highlightActiveLine(),
        cmKeymap.of([
          { key: 'Enter', run: continueMarkdownList },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        // Accessible name on the real textbox (.cm-content), not only the wrapper.
        EditorView.contentAttributes.of({ 'aria-label': label }),
        // ⌘⏎ / Ctrl+Enter: no-op in the body (shell skips publish; consume so
        // CodeMirror's insertBlankLine does not add a newline).
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
      base.push(fillPane, cmKeymap.of([indentWithTab]));
      if (placeholder) base.push(placeholderExt(placeholder));
      if (readOnly) base.push(EditorState.readOnly.of(true));
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
      placeholder,
      readOnly,
    ]);

    useLayoutEffect(() => {
      callbacks.current = { onChange };
    });

    // One view for the component's life; `extensions` and `value` sync below.
    useLayoutEffect(() => {
      const view = new EditorView({
        parent: parentRef.current!,
        state: EditorState.create({
          doc: value,
          extensions: [
            config.of(extensions),
            EditorView.updateListener.of((update) => {
              if (
                !update.docChanged ||
                update.transactions.some((tr) => tr.annotation(External))
              ) {
                return;
              }
              lastTyped.current = Date.now();
              callbacks.current.onChange(update.state.doc.toString());
            }),
          ],
        }),
      });
      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = undefined;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      viewRef.current?.dispatch({ effects: config.reconfigure(extensions) });
    }, [config, extensions]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const apply = () => {
        const doc = view.state.doc.toString();
        if (value === doc) return;
        view.dispatch({
          changes: { from: 0, to: doc.length, insert: value },
          annotations: External.of(true),
        });
      };
      const wait = lastTyped.current + TYPING_GRACE_MS - Date.now();
      if (wait <= 0) {
        apply();
        return;
      }
      const timer = window.setTimeout(apply, wait);
      return () => window.clearTimeout(timer);
    }, [value]);

    return (
      <div className="markdown-editor">
        <div
          ref={parentRef}
          className="markdown-editor__view"
          onBlur={onBlur}
        />
      </div>
    );
  },
);

export default MarkdownEditor;
