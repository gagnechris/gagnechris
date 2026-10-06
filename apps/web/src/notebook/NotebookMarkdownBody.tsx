import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EditorView } from '@codemirror/view';
import { findTaskEmbeds } from '@gagnechris/shared';
import { EditorAccessoryBar } from '../kit/markdown/EditorAccessoryBar';
import type { MarkdownEditorHandle } from '../kit/markdown/MarkdownEditor';
import { useTaskDateMenuEditor } from '../kit/markdown/taskDateMenuEditor';
import { taskListToggle } from '../kit/markdown/taskListToggle';
import { livePreview } from '../kit/markdown/livePreview';
import { useEditorViewMode } from '../kit/markdown/editorViewMode';
import { LazyMarkdownPreview } from '../kit/markdown/LazyMarkdownPreview';
import '../kit/markdown/markdown.css';
import { PHONE_QUERY, useMediaQuery } from '../kit/useMediaQuery';
import { useLocalToday } from './useLocalToday';
import { useNoteTaskEmbeds, type EmbedNote } from './useNoteTaskEmbeds';

const MarkdownEditor = lazy(() => import('../kit/markdown/MarkdownEditor'));

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Turns on task embeds; omit for task descriptions. */
  note?: EmbedNote;
  ensureNoteSaved?: () => Promise<unknown>;
  /** Scrolls this task's embed into view and flashes it, once it is in `value`. */
  highlightTaskId?: string | null;
  onHighlighted?: () => void;
};

/** Room under the caret for the accessory bar and the docked date chips. */
const PHONE_SCROLL_MARGIN = 160;
const FLASH_MS = 2000;
const HIGHLIGHT_WAIT_MS = 2000;
/** No image upload: Notebook attachments need the private bucket. */
export function NotebookMarkdownBody({
  value,
  onChange,
  note,
  ensureNoteSaved,
  highlightTaskId,
  onHighlighted,
}: Props) {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const mode = useEditorViewMode({
    rawStorageKey: 'notebook.rawMarkdown',
    editorRef,
  });
  const getView = useCallback(() => editorRef.current?.view(), []);
  const phone = useMediaQuery(PHONE_QUERY);
  const [focused, setFocused] = useState(false);
  const embeds = useNoteTaskEmbeds({
    markdown: value,
    note: note ?? null,
    ensureNoteSaved,
  });
  const dateMenu = useTaskDateMenuEditor({
    today: useLocalToday(),
    hint: 'Stays in this note. Shows up on Today from that date.',
  });
  const withTasks = note !== undefined;
  const extensions = useMemo(
    () => [
      mode.previewKeymap,
      ...(mode.raw ? [] : [livePreview()]),
      taskListToggle(),
      ...(withTasks ? dateMenu.extensions : []),
      ...embeds.extensions,
      EditorView.updateListener.of((update) => {
        if (update.focusChanged) setFocused(update.view.hasFocus);
      }),
      ...(phone
        ? [EditorView.scrollMargins.of(() => ({ bottom: PHONE_SCROLL_MARGIN }))]
        : []),
    ],
    [
      embeds.extensions,
      dateMenu.extensions,
      withTasks,
      phone,
      mode.raw,
      mode.previewKeymap,
    ],
  );

  const handledHighlight = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightTaskId) {
      handledHighlight.current = null;
      return;
    }
    if (handledHighlight.current === highlightTaskId) return;
    let frame = 0;
    const deadline = performance.now() + HIGHLIGHT_WAIT_MS;
    // The editor can apply a new `value` a beat after this render: it holds
    // external updates back while its own doc is changing.
    const attempt = () => {
      const view = editorRef.current?.view();
      const embed = view
        ? findTaskEmbeds(view.state.doc.toString()).find(
            (e) => e.id === highlightTaskId,
          )
        : undefined;
      if (!view || !embed) {
        if (performance.now() < deadline) {
          frame = requestAnimationFrame(attempt);
        }
        return;
      }
      handledHighlight.current = highlightTaskId;
      // The caret lands on the empty line under the embed, ready for context.
      const line = view.state.doc.line(
        Math.min(embed.line + 2, view.state.doc.lines),
      );
      view.dispatch({
        selection: { anchor: line.to },
        effects: EditorView.scrollIntoView(line.to, { y: 'center' }),
      });
      view.focus();
      frame = requestAnimationFrame(() => {
        onHighlighted?.();
        const el = view.dom.querySelector(
          `.cm-task-embed[data-task-id="${highlightTaskId}"]`,
        );
        if (!el) return;
        el.classList.add('cm-task-embed--flash');
        setTimeout(() => el.classList.remove('cm-task-embed--flash'), FLASH_MS);
      });
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [highlightTaskId, onHighlighted, value]);

  return (
    <>
      <div className="markdown-workspace markdown-workspace--single">
        <div className="markdown-bar markdown-bar--end">{mode.toggles}</div>
        <div className="markdown-single" data-previewing={mode.previewing}>
          <Suspense fallback={<p className="admin-hint">Loading editor…</p>}>
            <MarkdownEditor
              ref={editorRef}
              value={value}
              onChange={onChange}
              extensions={extensions}
              lineNumbers={false}
              label="Note body"
              placeholder="Write in markdown…"
            />
          </Suspense>
          {mode.previewPane(
            <LazyMarkdownPreview
              markdown={value}
              renderTaskEmbed={embeds.renderEmbed}
            />,
          )}
        </div>
      </div>
      {embeds.portals}
      {phone && focused ? (
        <EditorAccessoryBar getView={getView} tasks={withTasks} />
      ) : null}
      {withTasks ? dateMenu.menu : null}
      {embeds.toggleError ? (
        <p className="admin-panel__error" role="alert">
          {embeds.toggleError}
        </p>
      ) : null}
      {phone && withTasks ? (
        <p className="admin-hint">
          `[ ] text` then Enter adds a task, `@` picks its day
        </p>
      ) : null}
    </>
  );
}
