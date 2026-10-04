import { useId, useRef, useState, type FormEvent } from 'react';
import {
  MAX_SLUG_LENGTH,
  MEDIA_CONTENT_TYPES,
  PROJECT_DEMO_IDS,
  PROJECT_LINK_LABEL_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_ORDER_MAX,
  PROJECT_PITCH_MAX_LENGTH,
  PROJECT_STACK_ITEM_MAX_LENGTH,
  PROJECT_STACK_MAX,
  PROJECT_STAGE_LABELS,
  PROJECT_STAGE_NOTE_MAX_LENGTH,
  LINK_HREF_MAX_LENGTH,
  projectHasPage,
  projectPagePath,
  type ProjectDemo,
  type ProjectStage,
} from '@gagnechris/shared';
import { Button } from '../workspace/ui/Button';
import { Field, Select, TextArea, TextInput } from '../workspace/ui/Field';
import { Repeater } from '../workspace/ui/Repeater';
import {
  addStackItems,
  emptyProjectLink,
  projectHrefError,
  projectLinkErrors,
  projectOrderError,
  projectPreviewImageError,
  type ProjectDraftFields,
} from './projectDraft';

type SetField = <K extends keyof ProjectDraftFields>(
  key: K,
  value:
    | ProjectDraftFields[K]
    | ((prev: ProjectDraftFields[K]) => ProjectDraftFields[K]),
) => void;

type Props = {
  draft: ProjectDraftFields;
  setField: SetField;
  setSlugManual: (manual: boolean) => void;
  onSave: () => void;
  onUploadPreview: (file: File) => Promise<string>;
};

const STAGES = Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[];

const DEMO_LABELS: Record<ProjectDemo, string> = {
  posts: 'Posts',
  notebook: 'Notebook',
};

export function ProjectEditorFields({
  draft,
  setField,
  setSlugManual,
  onSave,
  onUploadPreview,
}: Props) {
  const hrefError = projectHrefError(draft.href);
  const orderError = projectOrderError(draft.orderText);

  return (
    <form
      className="admin-project-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="admin-project-card">
        <Field label="Name">
          <TextInput
            value={draft.name}
            maxLength={PROJECT_NAME_MAX_LENGTH}
            onChange={(e) => setField('name', e.target.value)}
          />
        </Field>
        <Field label="Slug" hint={<SlugPreview draft={draft} />}>
          <TextInput
            value={draft.slug}
            maxLength={MAX_SLUG_LENGTH}
            onChange={(e) => {
              setSlugManual(true);
              setField('slug', e.target.value);
            }}
          />
        </Field>
        <Field label="Pitch" hint="One line, shown on Home and Projects">
          <TextArea
            rows={2}
            value={draft.pitch}
            maxLength={PROJECT_PITCH_MAX_LENGTH}
            onChange={(e) => setField('pitch', e.target.value)}
          />
        </Field>
      </div>

      <div className="admin-project-card">
        <StageControl
          value={draft.stage}
          onChange={(stage) => setField('stage', stage)}
        />
        <Field
          label="Stage note"
          hint="Optional, e.g. “for fun” or “since 2026”"
        >
          <TextInput
            value={draft.stageNote}
            maxLength={PROJECT_STAGE_NOTE_MAX_LENGTH}
            onChange={(e) => setField('stageNote', e.target.value)}
          />
        </Field>
      </div>

      <div className="admin-project-card">
        <PreviewImageField
          value={draft.previewImage}
          requiredError={projectPreviewImageError(draft)}
          onChange={(path) => setField('previewImage', path)}
          onUpload={onUploadPreview}
        />
        <StackChips
          value={draft.stack}
          onChange={(stack) => setField('stack', stack)}
        />
        <div className="admin-project-row">
          <Field label="Demo">
            <Select
              value={draft.demo}
              onChange={(e) =>
                setField('demo', e.target.value as ProjectDemo | '')
              }
            >
              <option value="">None</option>
              {PROJECT_DEMO_IDS.map((id) => (
                <option key={id} value={id}>
                  {DEMO_LABELS[id]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Order" hint="Lower numbers are listed first">
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              max={PROJECT_ORDER_MAX}
              step={1}
              value={draft.orderText}
              aria-invalid={orderError ? true : undefined}
              onChange={(e) => setField('orderText', e.target.value)}
            />
            {orderError ? (
              <span className="admin-field-error">{orderError}</span>
            ) : null}
          </Field>
        </div>
        <Field
          label="Link card to…"
          hint="Optional. When set, the project card links here and replaces the project page."
        >
          <TextInput
            value={draft.href}
            maxLength={LINK_HREF_MAX_LENGTH}
            placeholder="/dont-feed-the-bears or https://…"
            aria-invalid={hrefError ? true : undefined}
            onChange={(e) => setField('href', e.target.value)}
          />
          {hrefError ? (
            <span className="admin-field-error">{hrefError}</span>
          ) : null}
        </Field>
      </div>

      <Repeater
        legend="Links"
        items={draft.links}
        onChange={(next) => setField('links', next)}
        createItem={emptyProjectLink}
        addLabel="Add link"
        removeLabel="Remove link"
        reorderable
        renderItem={(link, { update }) => {
          const errors = projectLinkErrors(link);
          return (
            <div className="admin-project-row">
              <Field label="Label">
                <TextInput
                  value={link.label}
                  maxLength={PROJECT_LINK_LABEL_MAX_LENGTH}
                  aria-invalid={errors.label ? true : undefined}
                  onChange={(e) => update({ label: e.target.value })}
                />
                {errors.label ? (
                  <span className="admin-field-error">{errors.label}</span>
                ) : null}
              </Field>
              <Field label="URL">
                <TextInput
                  value={link.url}
                  maxLength={LINK_HREF_MAX_LENGTH}
                  placeholder="https://… or /path"
                  aria-invalid={errors.url ? true : undefined}
                  onChange={(e) => update({ url: e.target.value })}
                />
                {errors.url ? (
                  <span className="admin-field-error">{errors.url}</span>
                ) : null}
              </Field>
            </div>
          );
        }}
      />
    </form>
  );
}

function SlugPreview({ draft }: { draft: ProjectDraftFields }) {
  const slug = draft.slug.trim() || '…';
  const href = draft.href.trim();
  if (href && !projectHrefError(href)) {
    return (
      <>
        No project page: the card links to <code>{href}</code>
      </>
    );
  }
  if (!projectHasPage({ ...draft, href: null })) {
    return (
      <>
        No page yet: an idea with no body is listed without a link. Page:{' '}
        <code>{projectPagePath(slug)}</code>
      </>
    );
  }
  return (
    <>
      Page: <code>{projectPagePath(slug)}</code>
    </>
  );
}

function StageControl({
  value,
  onChange,
}: {
  value: ProjectStage;
  onChange: (stage: ProjectStage) => void;
}) {
  const name = useId();
  return (
    <fieldset className="admin-segmented">
      <legend>Stage</legend>
      <div className="admin-segmented__options">
        {STAGES.map((stage) => (
          <label key={stage} className="admin-segmented__option">
            <input
              type="radio"
              name={name}
              value={stage}
              checked={value === stage}
              onChange={() => onChange(stage)}
            />
            <span>{PROJECT_STAGE_LABELS[stage]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PreviewImageField({
  value,
  requiredError,
  onChange,
  onUpload,
}: {
  value: string;
  requiredError: string | undefined;
  onChange: (path: string) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const requiredErrorId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
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

  return (
    <div className="admin-field admin-project-preview">
      <span>Preview image</span>
      <div className="admin-project-preview__row">
        {value ? (
          <img
            className="admin-project-preview__img"
            src={value}
            alt="Preview image"
          />
        ) : (
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
          <input
            ref={inputRef}
            id={inputId}
            className="admin-visually-hidden"
            type="file"
            accept={MEDIA_CONTENT_TYPES.join(',')}
            aria-label="Upload preview image"
            aria-invalid={requiredError ? true : undefined}
            aria-describedby={requiredError ? requiredErrorId : undefined}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {value ? (
            <Button variant="danger" onClick={() => onChange('')}>
              Remove image
            </Button>
          ) : null}
        </div>
      </div>
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
      <span className="admin-hint">
        Shown on the project card. JPEG, PNG, WebP or GIF.
      </span>
    </div>
  );
}

function StackChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (stack: string[]) => void;
}) {
  const [text, setText] = useState('');
  const inputId = useId();
  const full = value.length >= PROJECT_STACK_MAX;

  const commit = () => {
    if (!text.trim()) return;
    onChange(addStackItems(value, text));
    setText('');
  };

  return (
    <div className="admin-field">
      <label htmlFor={inputId}>Stack</label>
      <div className="admin-chips">
        <ul className="admin-chips__list" aria-label="Stack items">
          {value.map((item) => (
            <li key={item} className="admin-chip">
              {item}
              <button
                type="button"
                className="admin-chip__remove"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(value.filter((s) => s !== item))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <input
          id={inputId}
          className="admin-chips__input"
          value={text}
          maxLength={PROJECT_STACK_ITEM_MAX_LENGTH * 4}
          disabled={full}
          placeholder={full ? 'Stack is full' : 'Add, then Enter'}
          onChange={(e) => {
            const next = e.target.value;
            if (next.includes(',')) {
              onChange(addStackItems(value, next));
              setText('');
            } else {
              setText(next);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
        />
      </div>
    </div>
  );
}
