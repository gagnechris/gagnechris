import { Prec, type Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { MarkdownEditorHandle } from './MarkdownEditor';

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // Only a remembered preference.
  }
}

const isPreviewShortcut = (e: KeyboardEvent) =>
  (e.metaKey || e.ctrlKey) && e.key === '/';

/**
 * Live, raw-markdown and preview modes for a single-pane editor. ⌘/ toggles
 * Preview from the editor or the preview, and focus follows the visible pane.
 */
export function useEditorViewMode({
  rawStorageKey,
  editorRef,
}: {
  rawStorageKey: string;
  editorRef: RefObject<MarkdownEditorHandle | null>;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [raw, setRaw] = useState(() => readFlag(rawStorageKey));
  const previewRef = useRef<HTMLDivElement>(null);
  const togglePreview = useCallback(() => setPreviewing((p) => !p), []);
  const toggleRaw = useCallback(
    () =>
      setRaw((r) => {
        writeFlag(rawStorageKey, !r);
        return !r;
      }),
    [rawStorageKey],
  );
  const previewKeymap = useMemo<Extension>(
    () =>
      Prec.high(
        keymap.of([
          {
            key: 'Mod-/',
            run: () => {
              togglePreview();
              return true;
            },
          },
        ]),
      ),
    [togglePreview],
  );

  const toggled = useRef(false);
  useEffect(() => {
    if (!toggled.current) {
      toggled.current = true;
      return;
    }
    if (previewing) previewRef.current?.focus();
    else editorRef.current?.focus();
  }, [editorRef, previewing]);

  const toggles = (
    <div className="markdown-toolbar" role="toolbar" aria-label="View">
      <button
        type="button"
        className="markdown-toggle"
        aria-pressed={raw}
        disabled={previewing}
        onClick={toggleRaw}
      >
        Markdown
      </button>
      <button
        type="button"
        className="markdown-toggle"
        aria-pressed={previewing}
        aria-keyshortcuts="Meta+/ Control+/"
        title="Preview (⌘/)"
        onClick={togglePreview}
      >
        Preview
      </button>
    </div>
  );

  const previewPane = (children: ReactNode) =>
    previewing ? (
      <div
        ref={previewRef}
        className="markdown-single__preview"
        tabIndex={-1}
        role="region"
        aria-label="Preview"
        onKeyDown={(e) => {
          if (!isPreviewShortcut(e)) return;
          e.preventDefault();
          togglePreview();
        }}
      >
        <Suspense fallback={<p className="admin-hint">Loading preview…</p>}>
          {children}
        </Suspense>
      </div>
    ) : null;

  return { previewing, raw, previewKeymap, toggles, previewPane };
}
