import { lazy, Suspense, useMemo, useState } from 'react';
import { taskListToggle } from '../kit/markdown/taskListToggle';
import MarkdownPreview from '../kit/markdown/MarkdownPreview';
import '../kit/markdown/markdown.css';
import { useNoteTaskEmbeds, type EmbedNote } from './useNoteTaskEmbeds';

const MarkdownEditor = lazy(() => import('../kit/markdown/MarkdownEditor'));

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Turns on task embeds; omit for task descriptions. */
  note?: EmbedNote;
  ensureNoteSaved?: () => Promise<unknown>;
  hint?: string;
};

/** No image upload: Notebook attachments need the private bucket. */
export function NotebookMarkdownBody({
  value,
  onChange,
  note,
  ensureNoteSaved,
  hint,
}: Props) {
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit');
  const embeds = useNoteTaskEmbeds({
    markdown: value,
    note: note ?? null,
    ensureNoteSaved,
  });
  const extensions = useMemo(
    () => [taskListToggle(), ...embeds.extensions],
    [embeds.extensions],
  );

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
      {embeds.toggleError ? (
        <p className="admin-panel__error" role="alert">
          {embeds.toggleError}
        </p>
      ) : null}
      <p className="admin-hint">
        {hint ??
          (note
            ? '⌘S / Ctrl+S saves · `[ ] text` then Enter adds a task · checklists (`- [ ]`) toggle on click · autosave is on'
            : '⌘S / Ctrl+S saves · checklists (`- [ ]`) toggle on click · autosave is on')}
      </p>
    </>
  );
}
