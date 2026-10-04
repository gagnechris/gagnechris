import { lazy, Suspense } from 'react';
import MarkdownPreview from './MarkdownPreview';
import './markdown.css';

const MarkdownEditor = lazy(() => import('./MarkdownEditor'));

type Props = {
  value: string;
  onChange: (value: string) => void;
  mobilePane: 'edit' | 'preview';
  setMobilePane: (pane: 'edit' | 'preview') => void;
  onUploadImages: (files: File[]) => Promise<string[]>;
};

export function MarkdownBodyEditor({
  value,
  onChange,
  mobilePane,
  setMobilePane,
  onUploadImages,
}: Props) {
  return (
    <>
      <div className="markdown-workspace">
        <div className="markdown-tabs" role="tablist" aria-label="Editor view">
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
              onUploadImages={onUploadImages}
            />
          </Suspense>
          <MarkdownPreview markdown={value} />
        </div>
      </div>
      <p className="admin-hint">
        ⌘S / Ctrl+S saves · ⌘⏎ / Ctrl+Enter publishes (in the body editor: no
        publish and no blank line) · paste or drop images into the editor
      </p>
    </>
  );
}
