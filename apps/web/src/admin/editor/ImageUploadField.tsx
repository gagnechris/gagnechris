import { useId, useState, type ReactNode } from 'react';
import { MEDIA_CONTENT_TYPES } from '@gagnechris/shared';
import { Button, FileInput, TextInput } from '@gagnechris/ui';

type Props = {
  /** Also names the image, its upload button and its URL input. */
  label: string;
  value: string;
  onChange: (path: string) => void;
  /** Resolves to the uploaded image's path; a rejection is shown under the field. */
  onUpload: (file: File) => Promise<string>;
  /** `dropzone` also takes a typed URL; `thumbnail` is a small image beside the drop zone. */
  layout: 'dropzone' | 'thumbnail';
  requiredError?: string;
  hint?: ReactNode;
};

export function ImageUploadField({
  label,
  value,
  onChange,
  onUpload,
  layout,
  requiredError,
  hint,
}: Props) {
  const requiredErrorId = useId();
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file?.type.startsWith('image/')) return;
    setUploading(file.name);
    setError(null);
    try {
      onChange(await onUpload(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(null);
    }
  };

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

  const drop = (
    <FileInput
      className="admin-image-drop"
      accept={MEDIA_CONTENT_TYPES.join(',')}
      aria-label={label}
      aria-describedby={requiredError ? requiredErrorId : undefined}
      buttonLabel={value ? 'Replace image' : 'Upload image'}
      hint={layout === 'dropzone' ? 'Or drop an image here' : undefined}
      uploading={uploading ? { name: uploading } : undefined}
      onFiles={(files) => void upload(files[0])}
    />
  );

  return (
    <div
      className={`kit-field ${layout === 'dropzone' ? 'admin-cover' : 'admin-project-preview'}`}
    >
      <span>{label}</span>
      {layout === 'dropzone' ? (
        <>
          {image}
          {drop}
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
          {drop}
          {value ? (
            <Button variant="danger" onClick={() => onChange('')}>
              Remove image
            </Button>
          ) : null}
        </div>
      )}
      {error ? (
        <span className="kit-field-error" role="alert">
          {error}
        </span>
      ) : null}
      {requiredError ? (
        <span id={requiredErrorId} className="kit-field-error">
          {requiredError}
        </span>
      ) : null}
      {hint ? <span className="kit-hint">{hint}</span> : null}
    </div>
  );
}
