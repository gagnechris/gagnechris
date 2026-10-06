import { useEffect, useId, type FormEvent, type RefObject } from 'react';
import type { components } from '@gagnechris/api-client';
import {
  MAX_SLUG_LENGTH,
  PROJECT_STAGE_LABELS,
  sortProjectsByOrder,
} from '@gagnechris/shared';
import { Field, TextArea, TextInput } from '../kit/Field';
import { MarkdownBodyEditor } from '../kit/markdown/MarkdownBodyEditor';
import { BodyPreview } from './editor/BodyPreview';
import { ChipsInput } from './editor/ChipsInput';
import { ImageUploadField } from './editor/ImageUploadField';
import type { SetDraftField } from './editor/useDraftFields';
import { publicImageSrc } from './publicUrl';
import { parsePostTags, type PostDraftFields } from './postDraft';

type Project = components['schemas']['Project'];

type DetailsProps = {
  draft: PostDraftFields;
  setField: SetDraftField<PostDraftFields>;
  setSlugManual: (manual: boolean) => void;
  onSave: () => void;
  onUploadImage: (file: File) => Promise<string>;
  /** `undefined` while loading. */
  projects: readonly Project[] | undefined;
  projectsError: string | null;
};

export function PostEditorDetails({
  draft,
  setField,
  setSlugManual,
  onSave,
  onUploadImage,
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
        <ChipsInput
          label="Tags"
          listLabel="Post tags"
          removeLabel={(tag) => `Remove tag ${tag}`}
          placeholder="Add tag"
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
        <ImageUploadField
          layout="dropzone"
          label="Cover image"
          value={draft.coverImage}
          onChange={(path) => setField('coverImage', path)}
          onUpload={onUploadImage}
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
  setField: SetDraftField<PostDraftFields>;
  onUploadImages: (files: File[]) => Promise<string[]>;
};

export function PostEditorBody({ draft, setField, onUploadImages }: BodyProps) {
  return (
    <MarkdownBodyEditor
      value={draft.bodyMarkdown}
      onChange={(value) => setField('bodyMarkdown', value)}
      onUploadImages={onUploadImages}
      preview={<BodyPreview kind="post" markdown={draft.bodyMarkdown} />}
      resolveImageSrc={publicImageSrc}
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
