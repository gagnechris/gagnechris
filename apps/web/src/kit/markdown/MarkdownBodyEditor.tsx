import { lazy, Suspense, useId, useRef, useState, type ReactNode } from 'react';
import { MEDIA_CONTENT_TYPES } from '@gagnechris/shared';
import type { EditorView } from '@codemirror/view';
import MarkdownPreview from './MarkdownPreview';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import { insertCodeBlock, insertImages, insertLink } from './editorAccessory';
import './markdown.css';

const MarkdownEditor = lazy(() => import('./MarkdownEditor'));

export type EditorPane = 'write' | 'split' | 'preview';

const PANES: readonly { value: EditorPane; label: string }[] = [
  { value: 'write', label: 'Write' },
  { value: 'split', label: 'Split' },
  { value: 'preview', label: 'Preview' },
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  onUploadImages: (files: File[]) => Promise<string[]>;
  /** Replaces the default `MarkdownPreview` pane. */
  preview?: ReactNode;
};

const initialPane = (): EditorPane =>
  window.matchMedia?.('(min-width: 1024px)').matches ? 'split' : 'write';

const icon = (path: ReactNode) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
);

export function MarkdownBodyEditor({
  value,
  onChange,
  onUploadImages,
  preview,
}: Props) {
  const [pane, setPane] = useState<EditorPane>(initialPane);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileId = useId();

  const run = (command: (view: EditorView) => void) => {
    const view = editorRef.current?.view();
    if (view) command(view);
  };

  const uploadPicked = async (files: File[]) => {
    const paths = await onUploadImages(files);
    const view = editorRef.current?.view();
    if (!view) return;
    insertImages(
      view,
      paths.map((path, i) => ({
        alt: files[i]?.name.replace(/\.[^.]+$/, '') || 'image',
        path,
      })),
    );
  };

  return (
    <>
      <div className="markdown-workspace">
        <div className="markdown-bar">
          <div
            className="markdown-tabs markdown-tabs--views"
            role="tablist"
            aria-label="Editor view"
          >
            {PANES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                className={`markdown-tabs__btn markdown-tabs__btn--${option.value}`}
                aria-selected={pane === option.value}
                onClick={() => setPane(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {pane === 'preview' ? null : (
            <div
              className="markdown-toolbar"
              role="toolbar"
              aria-label="Insert"
            >
              <label
                htmlFor={fileId}
                className="markdown-toolbar__btn"
                title="Insert image"
              >
                {icon(
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                  </>,
                )}
              </label>
              <input
                ref={fileRef}
                id={fileId}
                className="admin-visually-hidden"
                type="file"
                multiple
                accept={MEDIA_CONTENT_TYPES.join(',')}
                aria-label="Insert image"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (fileRef.current) fileRef.current.value = '';
                  if (files.length > 0) void uploadPicked(files);
                }}
              />
              <button
                type="button"
                className="markdown-toolbar__btn"
                aria-label="Insert link"
                title="Insert link"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(insertLink)}
              >
                {icon(
                  <>
                    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
                  </>,
                )}
              </button>
              <button
                type="button"
                className="markdown-toolbar__btn"
                aria-label="Insert code block"
                title="Insert code block"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(insertCodeBlock)}
              >
                {icon(<path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />)}
              </button>
            </div>
          )}
        </div>
        <div className="markdown-split markdown-split--views" data-pane={pane}>
          <Suspense fallback={<p className="admin-hint">Loading editor…</p>}>
            <MarkdownEditor
              ref={editorRef}
              value={value}
              onChange={onChange}
              onUploadImages={onUploadImages}
            />
          </Suspense>
          {preview ?? <MarkdownPreview markdown={value} />}
        </div>
      </div>
      <p className="admin-hint">
        ⌘S / Ctrl+S saves · ⌘⏎ / Ctrl+Enter publishes (in the body editor: no
        publish and no blank line) · paste or drop images into the editor
      </p>
    </>
  );
}
