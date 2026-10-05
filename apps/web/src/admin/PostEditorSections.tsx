import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import type { components } from '@gagnechris/api-client';
import {
  MAX_SLUG_LENGTH,
  MEDIA_CONTENT_TYPES,
  PROJECT_STAGE_LABELS,
  sortProjectsByOrder,
} from '@gagnechris/shared';
import { Button } from '../kit/Button';
import { Field, TextArea, TextInput } from '../kit/Field';
import { MarkdownBodyEditor } from '../kit/markdown/MarkdownBodyEditor';
import { PostBodyPreview } from './PostBodyPreview';
import { parsePostTags } from './postDraft';

export type PostDraftFields = {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  tagsText: string;
  projectIds: string[];
  coverImage: string;
  seoTitle: string;
  seoDescription: string;
};

type Project = components['schemas']['Project'];

type DetailsProps = {
  draft: PostDraftFields;
  setField: <K extends keyof PostDraftFields>(
    key: K,
    value: PostDraftFields[K],
  ) => void;
  setSlugManual: (manual: boolean) => void;
  onSave: () => void;
  onUploadImages: (files: File[]) => Promise<string[]>;
  /** `undefined` while loading. */
  projects: readonly Project[] | undefined;
  projectsError: string | null;
};

export function PostEditorDetails({
  draft,
  setField,
  setSlugManual,
  onSave,
  onUploadImages,
  projects,
  projectsError,
}: DetailsProps) {
  const slugId = useId();
  const slugHintId = useId();
  return (
    <aside className="admin-details-panel" aria-label="Post details">
      <h2 className="admin-details-panel__title">Details</h2>
      <form
        className="admin-details-panel__form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div className="admin-field">
          <label htmlFor={slugId}>Slug</label>
          <div className="admin-prefixed">
            <span className="admin-prefixed__prefix" aria-hidden="true">
              /
            </span>
            <input
              id={slugId}
              className="admin-prefixed__input"
              value={draft.slug}
              maxLength={MAX_SLUG_LENGTH}
              aria-describedby={slugHintId}
              onChange={(e) => {
                setSlugManual(true);
                setField('slug', e.target.value);
              }}
            />
          </div>
          <span id={slugHintId} className="admin-hint">
            Follows the title until you edit it.
          </span>
        </div>
        <TagChips
          value={parsePostTags(draft.tagsText)}
          onChange={(tags) => setField('tagsText', tags.join(', '))}
        />
        <Field label="Excerpt">
          <TextArea
            rows={3}
            value={draft.excerpt}
            placeholder="Shown on the blog index and in RSS"
            onChange={(e) => setField('excerpt', e.target.value)}
          />
        </Field>
        <CoverImageField
          value={draft.coverImage}
          onChange={(path) => setField('coverImage', path)}
          onUploadImages={onUploadImages}
        />
        <PostProjectsField
          projects={projects}
          error={projectsError}
          selected={draft.projectIds}
          onChange={(ids) => setField('projectIds', ids)}
        />
        <details className="admin-seo">
          <summary>SEO overrides</summary>
          <p className="admin-hint">
            Title and description default to the post title and excerpt.
          </p>
          <Field label="SEO title">
            <TextInput
              value={draft.seoTitle}
              placeholder={draft.title}
              onChange={(e) => setField('seoTitle', e.target.value)}
            />
          </Field>
          <Field label="SEO description">
            <TextArea
              rows={3}
              value={draft.seoDescription}
              placeholder={draft.excerpt}
              onChange={(e) => setField('seoDescription', e.target.value)}
            />
          </Field>
        </details>
      </form>
      <p className="admin-details-panel__keys">
        <kbd>⌘S</kbd> save · <kbd>⌘⏎</kbd> publish
      </p>
    </aside>
  );
}

function TagChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState('');
  const inputId = useId();

  const add = (raw: string) => {
    const next = [...value];
    for (const tag of parsePostTags(raw)) {
      if (!next.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        next.push(tag);
      }
    }
    if (next.length !== value.length) onChange(next);
  };

  const commit = () => {
    if (!text.trim()) return;
    add(text);
    setText('');
  };

  return (
    <div className="admin-field">
      <label htmlFor={inputId}>Tags</label>
      <div className="admin-chips">
        <ul className="admin-chips__list" aria-label="Post tags">
          {value.map((tag) => (
            <li key={tag} className="admin-chip">
              {tag}
              <button
                type="button"
                className="admin-chip__remove"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
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
          placeholder="Add tag"
          onChange={(e) => {
            const next = e.target.value;
            if (next.includes(',')) {
              add(next);
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

function CoverImageField({
  value,
  onChange,
  onUploadImages,
}: {
  value: string;
  onChange: (path: string) => void;
  onUploadImages: (files: File[]) => Promise<string[]>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const [path] = await onUploadImages([file]);
      if (path) onChange(path);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="admin-field admin-cover">
      <span>Cover image</span>
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
          void upload(e.dataTransfer.files[0]);
        }}
      >
        {value ? (
          <img className="admin-cover__img" src={value} alt="Cover image" />
        ) : (
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
        )}
        <span>
          {uploading
            ? 'Uploading…'
            : value
              ? 'Drop or click to replace'
              : 'Drop an image or click to upload'}
        </span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        className="admin-visually-hidden"
        type="file"
        accept={MEDIA_CONTENT_TYPES.join(',')}
        aria-label="Upload cover image"
        disabled={uploading}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <div className="admin-cover__url">
        <TextInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/media/… or https://…"
          aria-label="Cover image URL"
        />
        {value ? (
          <Button variant="danger" onClick={() => onChange('')}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PostProjectsField({
  projects,
  error,
  selected,
  onChange,
}: {
  projects: readonly Project[] | undefined;
  error: string | null;
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const hintId = useId();
  const toggle = (id: string, on: boolean) =>
    onChange(
      on ? [...selected, id] : selected.filter((existing) => existing !== id),
    );

  let options;
  if (error) {
    options = <p className="admin-hint">{error}</p>;
  } else if (!projects) {
    options = <p className="admin-hint">Loading projects…</p>;
  } else if (projects.length === 0) {
    options = <p className="admin-hint">No projects yet.</p>;
  } else {
    options = (
      <ul className="admin-post-projects__list">
        {sortProjectsByOrder(projects).map((project) => (
          <li key={project.id}>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={selected.includes(project.id)}
                onChange={(e) => toggle(project.id, e.target.checked)}
              />
              {`${project.name} · ${PROJECT_STAGE_LABELS[project.stage]}`}
            </label>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <fieldset
      className="admin-field admin-field--full admin-post-projects"
      aria-describedby={hintId}
    >
      <legend>Part of project</legend>
      <span id={hintId} className="admin-hint">
        Lists this post in the project’s Build log. Not the same as Tags.
      </span>
      {options}
    </fieldset>
  );
}

type BodyProps = {
  draft: PostDraftFields;
  setField: <K extends keyof PostDraftFields>(
    key: K,
    value: PostDraftFields[K],
  ) => void;
  onUploadImages: (files: File[]) => Promise<string[]>;
};

export function PostEditorBody({ draft, setField, onUploadImages }: BodyProps) {
  return (
    <MarkdownBodyEditor
      value={draft.bodyMarkdown}
      onChange={(value) => setField('bodyMarkdown', value)}
      onUploadImages={onUploadImages}
      preview={<PostBodyPreview markdown={draft.bodyMarkdown} />}
    />
  );
}

type TitleProps = {
  title: string;
  titleRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
};

export function PostEditorTitle({ title, titleRef, onChange }: TitleProps) {
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title, titleRef]);

  return (
    <h1 className="admin-editor-title">
      <textarea
        ref={titleRef}
        className="admin-title-input"
        rows={1}
        value={title}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Title"
      />
    </h1>
  );
}
