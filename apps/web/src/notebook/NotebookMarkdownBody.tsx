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
import MarkdownPreview from '../kit/markdown/MarkdownPreview';
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
  hint?: string;
  /** Scrolls this task's embed into view and flashes it, once it is in `value`. */
  highlightTaskId?: string | null;
  onHighlighted?: () => void;
};

/** Room under the caret for the accessory bar and the docked date chips. */
const PHONE_SCROLL_MARGIN = 160;
const FLASH_MS = 2000;

/** No image upload: Notebook attachments need the private bucket. */
export function NotebookMarkdownBody({
  value,
  onChange,
  note,
  ensureNoteSaved,
  hint,
  highlightTaskId,
  onHighlighted,
}: Props) {
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit');
  const editorRef = useRef<MarkdownEditorHandle>(null);
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
    [embeds.extensions, dateMenu.extensions, withTasks, phone],
  );

  useEffect(() => {
    if (!highlightTaskId) return;
    const view = editorRef.current?.view();
    if (!view) return;
    const embed = findTaskEmbeds(view.state.doc.toString()).find(
      (e) => e.id === highlightTaskId,
    );
    if (!embed) return;
    view.dispatch({
      effects: EditorView.scrollIntoView(
        view.state.doc.line(embed.line + 1).from,
        { y: 'center' },
      ),
    });
    const frame = requestAnimationFrame(() => {
      onHighlighted?.();
      const el = view.dom.querySelector(
        `.cm-task-embed[data-task-id="${highlightTaskId}"]`,
      );
      if (!el) return;
      el.classList.add('cm-task-embed--flash');
      setTimeout(() => el.classList.remove('cm-task-embed--flash'), FLASH_MS);
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightTaskId, onHighlighted, value]);

  return (
    <>
      <div className="markdown-workspace">
        <div className="markdown-tabs" role="tablist" aria-label="Editor panes">
          <button
            type="button"
            role="tab"
            className="markdown-tabs__btn"
            aria-selected={mobilePane === 'edit'}
            onClick={() => setMobilePane('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            role="tab"
            className="markdown-tabs__btn"
            aria-selected={mobilePane === 'preview'}
            onClick={() => setMobilePane('preview')}
          >
            Preview
          </button>
        </div>
        <div className="markdown-split" data-pane={mobilePane}>
          <Suspense fallback={<p className="admin-hint">Loading editor…</p>}>
            <MarkdownEditor
              ref={editorRef}
              value={value}
              onChange={onChange}
              extensions={extensions}
              label="Note body"
              placeholder="Write in markdown…"
            />
          </Suspense>
          <MarkdownPreview
            markdown={value}
            renderTaskEmbed={embeds.renderEmbed}
          />
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
      <p className="admin-hint">
        {hint ??
          (note
            ? '⌘S / Ctrl+S saves · `[ ] text` then Enter adds a task, `@` picks its day · checklists (`- [ ]`) toggle on click · autosave is on'
            : '⌘S / Ctrl+S saves · checklists (`- [ ]`) toggle on click · autosave is on')}
      </p>
    </>
  );
}
