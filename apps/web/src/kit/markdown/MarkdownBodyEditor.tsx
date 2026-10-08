import { useId, useMemo, useRef, type ReactNode } from 'react';
import { MEDIA_CONTENT_TYPES } from '@gagnechris/shared';
import type { EditorView } from '@codemirror/view';
import { LazyMarkdownPreview } from './LazyMarkdownPreview';
import { loadMarkdownPreview } from './markdownPreviewModule';
// Static, not lazy: only lazy editor routes use this, and React throttles
// Suspense reveals to 300 ms, so a fallback here would hold the editor back.
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor';
import { insertCodeBlock, insertImages, insertLink } from './editorAccessory';
import { useEditorViewMode } from './editorViewMode';
import { markdownImages } from './imageWidgets';
import { livePreview } from './livePreview';
import './markdown.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onUploadImages: (files: File[]) => Promise<string[]>;
  /** Replaces the default `MarkdownPreview` in Preview. */
  preview?: ReactNode;
  /** Maps an image's markdown `src` to a URL this app can load. */
  resolveImageSrc?: (src: string) => string;
};

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
  resolveImageSrc,
}: Props) {
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const mode = useEditorViewMode({
    rawStorageKey: 'admin.rawMarkdown',
    editorRef,
    preloadPreview: preview ? undefined : loadMarkdownPreview,
  });
  const extensions = useMemo(
    () => [
      mode.previewKeymap,
      ...(mode.raw
        ? []
        : [livePreview(), markdownImages({ resolveSrc: resolveImageSrc })]),
    ],
    [mode.previewKeymap, mode.raw, resolveImageSrc],
  );
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
      <div className="markdown-workspace markdown-workspace--single">
        <div className="markdown-bar">
          {mode.previewing ? (
            <span />
          ) : (
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
          {mode.toggles}
        </div>
        <div
          className="markdown-single markdown-single--reading"
          data-previewing={mode.previewing}
        >
          <MarkdownEditor
            ref={editorRef}
            value={value}
            onChange={onChange}
            onUploadImages={onUploadImages}
            extensions={extensions}
            lineNumbers={false}
          />
          {mode.previewPane(
            preview ?? <LazyMarkdownPreview markdown={value} />,
          )}
        </div>
      </div>
      <p className="admin-hint">
        ⌘S / Ctrl+S saves · ⌘⏎ / Ctrl+Enter publishes (in the body editor: no
        publish and no blank line) · ⌘/ / Ctrl+/ previews · paste or drop images
        into the editor
      </p>
    </>
  );
}
