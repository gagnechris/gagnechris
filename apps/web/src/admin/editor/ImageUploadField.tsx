import { useId, useRef, useState, type ReactNode } from 'react';
import { MEDIA_CONTENT_TYPES } from '@gagnechris/shared';
import { Button } from '../../kit/Button';
import { TextInput } from '../../kit/Field';

type Props = {
  /** Also names the image, its file input ("Upload …") and its URL input. */
  label: string;
  value: string;
  onChange: (path: string) => void;
  /** Resolves to the uploaded image's path; a rejection is shown under the field. */
  onUpload: (file: File) => Promise<string>;
  /** `dropzone` takes drops and a typed URL; `thumbnail` is a small image and buttons. */
  layout: 'dropzone' | 'thumbnail';
  requiredError?: string;
  hint?: ReactNode;
};

const uploadIcon = (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

export function ImageUploadField({
  label,
  value,
  onChange,
  onUpload,
  layout,
  requiredError,
  hint,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const requiredErrorId = useId();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onChange(await onUpload(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const fileInput = (
    <input
      ref={inputRef}
      id={inputId}
      className="admin-visually-hidden"
      type="file"
      accept={MEDIA_CONTENT_TYPES.join(',')}
      aria-label={`Upload ${label.toLowerCase()}`}
      aria-invalid={requiredError ? true : undefined}
      aria-describedby={requiredError ? requiredErrorId : undefined}
      disabled={uploading}
      onChange={(e) => void upload(e.target.files?.[0])}
    />
  );

  const image = value ? (
    <img
      className={
        layout === 'dropzone'
          ? 'admin-cover__img'
          : 'admin-project-preview__img'
      }
      src={value}
      alt={label}
    />
  ) : null;

  return (
    <div
      className={`admin-field ${layout === 'dropzone' ? 'admin-cover' : 'admin-project-preview'}`}
    >
      <span>{label}</span>
      {layout === 'dropzone' ? (
        <>
          <label
            htmlFor={inputId}
            className="admin-cover__drop"
            data-dragging={dragging || undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file?.type.startsWith('image/')) void upload(file);
            }}
          >
            {image ?? uploadIcon}
            <span>
              {uploading
                ? 'Uploading…'
                : value
                  ? 'Drop or click to replace'
                  : 'Drop an image or click to upload'}
            </span>
          </label>
          {fileInput}
          <div className="admin-cover__url">
            <TextInput
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="/media/… or https://…"
              aria-label={`${label} URL`}
            />
            {value ? (
              <Button variant="danger" onClick={() => onChange('')}>
                Remove
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="admin-project-preview__row">
          {image ?? (
            <span className="admin-project-preview__empty" aria-hidden="true" />
          )}
          <div className="admin-actions">
            <label htmlFor={inputId} className="admin-btn">
              {uploading
                ? 'Uploading…'
                : value
                  ? 'Replace image'
                  : 'Upload image'}
            </label>
            {fileInput}
            {value ? (
              <Button variant="danger" onClick={() => onChange('')}>
                Remove image
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {error ? (
        <span className="admin-field-error" role="alert">
          {error}
        </span>
      ) : null}
      {requiredError ? (
        <span id={requiredErrorId} className="admin-field-error">
          {requiredError}
        </span>
      ) : null}
      {hint ? <span className="admin-hint">{hint}</span> : null}
    </div>
  );
}
