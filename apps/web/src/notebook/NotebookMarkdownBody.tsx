import { lazy, Suspense, useMemo, useState } from 'react';
import { taskListToggle } from '../kit/markdown/taskListToggle';
import MarkdownPreview from '../kit/markdown/MarkdownPreview';
import '../kit/markdown/markdown.css';

const MarkdownEditor = lazy(() => import('../kit/markdown/MarkdownEditor'));

type Props = {
  value: string;
  onChange: (value: string) => void;
  hint?: string;
};

/** No image upload: Notebook attachments need the private bucket. */
export function NotebookMarkdownBody({ value, onChange, hint }: Props) {
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit');
  const extensions = useMemo(() => [taskListToggle()], []);

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
          <MarkdownPreview markdown={value} />
        </div>
      </div>
      <p className="admin-hint">
        {hint ??
          '⌘S / Ctrl+S saves · checklists (`- [ ]`) toggle on click · autosave is on'}
      </p>
    </>
  );
}
