import { Prec, type Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import {
  caretViewportY,
  docAnchor,
  paneAnchor,
  restoreDocAnchor,
  restorePaneAnchor,
  scrollParent,
  type DocAnchor,
  type PaneAnchor,
} from './viewAnchor';

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

/** Long enough to stay off the editor's first paint. */
const PRELOAD_DELAY_MS = 1500;

const isPreviewShortcut = (e: KeyboardEvent) =>
  (e.metaKey || e.ctrlKey) && e.key === '/';

/**
 * Live, raw-markdown and preview modes for a single-pane editor. ⌘/ toggles
 * Preview from the editor or the preview, focus follows the visible pane, and
 * every switch keeps the caret, or the top of what was visible, in place.
 * Markdown from Preview goes straight to raw markdown.
 */
export function useEditorViewMode({
  rawStorageKey,
  editorRef,
  preloadPreview,
}: {
  rawStorageKey: string;
  editorRef: RefObject<MarkdownEditorHandle | null>;
  /** Called soon after mount and on hovering or focusing Preview; Preview opens once it resolves. */
  preloadPreview?: () => unknown;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [raw, setRaw] = useState(() => readFlag(rawStorageKey));
  const previewRef = useRef<HTMLDivElement>(null);
  const previewingRef = useRef(previewing);
  const focusEditorOnExit = useRef(true);
  const swap = useRef<{ anchor: PaneAnchor | null; scrollTop: number } | null>(
    null,
  );
  const beforePreview = useRef<{
    scroller: Element;
    editorTop: number;
    previewTop: number;
  } | null>(null);

  const setPreview = useCallback(
    (on: boolean) => {
      if (on === previewingRef.current) return;
      previewingRef.current = on;
      const apply = () => {
        if (previewingRef.current !== on) return;
        const view = editorRef.current?.view();
        const pane = on ? view?.dom : previewRef.current;
        swap.current = pane
          ? {
              anchor: paneAnchor(
                pane,
                on && view ? caretViewportY(view) : undefined,
              ),
              scrollTop: scrollParent(pane).scrollTop,
            }
          : null;
        setPreviewing(on);
      };
      // A suspended preview is a few pixels tall, so the scroll anchor and
      // the reader's place would be lost; open it once its chunk is in.
      if (on && preloadPreview) {
        void Promise.resolve(preloadPreview())
          .catch(() => undefined)
          .then(apply);
      } else {
        apply();
      }
    },
    [editorRef, preloadPreview],
  );
  const togglePreview = useCallback(
    () => setPreview(!previewingRef.current),
    [setPreview],
  );
  const setRawFlag = (on: boolean) => {
    writeFlag(rawStorageKey, on);
    setRaw(on);
  };
  const onMarkdown = () => {
    if (!previewingRef.current) {
      setRawFlag(!raw);
      return;
    }
    setPreview(false);
    if (!raw) setRawFlag(true);
  };

  const previewKeymap = useMemo<Extension>(
    () =>
      Prec.high(
        // eslint-disable-next-line react-hooks/refs -- `run` reads them on keypress, not in render
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

  useEffect(() => {
    if (!preloadPreview) return;
    const handle = window.setTimeout(preloadPreview, PRELOAD_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [preloadPreview]);

  // Compared, not a first-run flag: StrictMode runs mount effects twice.
  const shown = useRef(previewing);
  useLayoutEffect(() => {
    if (shown.current === previewing) return;
    shown.current = previewing;
    const from = swap.current;
    swap.current = null;
    if (previewing) {
      const pane = previewRef.current;
      if (!pane) return;
      const scroller = scrollParent(pane);
      if (from?.anchor) restorePaneAnchor(pane, from.anchor);
      beforePreview.current = from
        ? {
            scroller,
            editorTop: from.scrollTop,
            previewTop: scroller.scrollTop,
          }
        : null;
      pane.focus({ preventScroll: true });
      return;
    }
    const before = beforePreview.current;
    beforePreview.current = null;
    if (before && from?.scrollTop === before.previewTop) {
      before.scroller.scrollTop = before.editorTop;
    } else {
      const pane = editorRef.current?.view()?.dom;
      if (pane && from?.anchor) restorePaneAnchor(pane, from.anchor);
    }
    if (focusEditorOnExit.current) editorRef.current?.focus();
    focusEditorOnExit.current = true;
  }, [editorRef, previewing]);

  // Captured before the editor reconfigures (a passive effect in the child),
  // put back once it has. Declared after the Preview effect, so Markdown from
  // Preview anchors on the restored editor.
  const rawShown = useRef(raw);
  const rawAnchor = useRef<DocAnchor | null>(null);
  useLayoutEffect(() => {
    if (rawShown.current === raw) return;
    const view = editorRef.current?.view();
    rawAnchor.current = view && !previewing ? docAnchor(view) : null;
  }, [editorRef, previewing, raw]);
  useEffect(() => {
    if (rawShown.current === raw) return;
    rawShown.current = raw;
    const view = editorRef.current?.view();
    const anchor = rawAnchor.current;
    rawAnchor.current = null;
    if (!view || previewing) return;
    if (anchor) restoreDocAnchor(view, anchor);
    view.focus();
  }, [editorRef, previewing, raw]);

  const toggles = (
    <div className="markdown-toolbar" role="toolbar" aria-label="View">
      <button
        type="button"
        className="markdown-toggle"
        aria-pressed={raw}
        onClick={onMarkdown}
      >
        Markdown
      </button>
      <button
        type="button"
        className="markdown-toggle"
        aria-pressed={previewing}
        aria-keyshortcuts="Meta+/ Control+/"
        title="Preview (⌘/)"
        onPointerEnter={preloadPreview}
        onFocus={preloadPreview}
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

  /** Leaves Preview without focusing the editor: the caller places the caret. */
  const showEditor = useCallback(() => {
    if (!previewingRef.current) return;
    focusEditorOnExit.current = false;
    setPreview(false);
  }, [setPreview]);

  return { previewing, raw, previewKeymap, toggles, previewPane, showEditor };
}
