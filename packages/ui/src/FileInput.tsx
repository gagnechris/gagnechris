/** @jsxRuntime automatic */
import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Button } from './Button.js';
import { cx } from './cx.js';
import { useFieldControl } from './fieldContext.js';

type Props = {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  buttonLabel?: string;
  hint?: ReactNode;
  /** Replaces the button with the file name and a progress bar (0 to 1; omit for indeterminate). */
  uploading?: { name: string; progress?: number };
  /** Names the control when it is not inside a Field. */
  'aria-label'?: string;
  className?: string;
};

/** A dashed drop zone with a button that opens the file picker. */
export const FileInput = ({
  onFiles,
  accept,
  multiple,
  disabled,
  buttonLabel = 'Choose file',
  hint,
  uploading,
  className,
  ...aria
}: Props) => {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();
  const buttonId = useId();
  const field = useFieldControl(
    { 'aria-describedby': hint ? hintId : undefined },
    false,
  );
  const name = aria['aria-label'];
  const labelledBy = name
    ? undefined
    : field.labelId
      ? `${field.labelId} ${buttonId}`
      : undefined;

  const accepts = (e: DragEvent) =>
    !disabled && !uploading && e.dataTransfer.types.includes('Files');

  const dragProps = {
    onDragEnter: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null))
        setOver(false);
    },
    onDrop: (e: DragEvent) => {
      setOver(false);
      if (!accepts(e)) return;
      e.preventDefault();
      const files = [...e.dataTransfer.files];
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    },
  };

  return (
    <div
      className={cx(
        'ui-file',
        over && 'ui-file--over',
        disabled && 'ui-file--disabled',
        className,
      )}
      {...dragProps}
    >
      <input
        ref={input}
        type="file"
        className="ui-visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      {uploading ? (
        <div className="ui-file__progress">
          <span className="ui-file__name">{uploading.name}</span>
          <progress
            aria-label={`Uploading ${uploading.name}`}
            max={1}
            value={uploading.progress}
          />
        </div>
      ) : (
        <>
          <Button
            id={buttonId}
            size="sm"
            disabled={disabled}
            aria-label={name ? `${name}: ${buttonLabel}` : undefined}
            aria-labelledby={labelledBy}
            aria-describedby={field.aria['aria-describedby']}
            onClick={() => input.current?.click()}
          >
            {buttonLabel}
          </Button>
          {hint ? (
            <span id={hintId} className="ui-file__hint">
              {hint}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
};
