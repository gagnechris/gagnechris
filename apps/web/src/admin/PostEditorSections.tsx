import { useId, type FormEvent, type RefObject } from 'react';
import type { components } from '@gagnechris/api-client';
import { parsePostTags, type PostDraftFields } from '@gagnechris/app-core';
import {
  MAX_SLUG_LENGTH,
  PROJECT_STAGE_LABELS,
  sortProjectsByOrder,
} from '@gagnechris/shared';
import {
  Checkbox,
  ChipsInput,
  Field,
  TextArea,
  TextInput,
} from '@gagnechris/ui';
import { MarkdownBodyEditor } from '../kit/markdown/MarkdownBodyEditor';
import { ImageUploadField } from './editor/ImageUploadField';
import type { SetDraftField } from './editor/useDraftFields';
import { publicImageSrc } from './publicUrl';

type Project = components['schemas']['Project'];

type DetailsProps = {
  draft: PostDraftFields;
  setField: SetDraftField<PostDraftFields>;
  /** Whether the slug no longer follows the title. */
  slugManual: boolean;
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
  slugManual,
  setSlugManual,
  onSave,
  onUploadImage,
  projects,
  projectsError,
}: DetailsProps) {
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
        <Field
          label="Slug"
          hint={slugManual ? undefined : 'Follows the title until you edit it.'}
        >
          <TextInput
            prefix="/"
            className="admin-slug-input"
            value={draft.slug}
            maxLength={MAX_SLUG_LENGTH}
            onChange={(e) => {
              setSlugManual(true);
              setField('slug', e.target.value);
            }}
          />
        </Field>
        <ChipsInput
          label="Tags"
          listLabel="Post tags"
          itemLabel={(tag) => `tag ${tag}`}
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
          <p className="kit-hint">
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
    options = <p className="kit-hint">{error}</p>;
  } else if (!projects) {
    options = <p className="kit-hint">Loading projects…</p>;
  } else if (projects.length === 0) {
    options = <p className="kit-hint">No projects yet.</p>;
  } else {
    options = (
      <ul className="admin-post-projects__list">
        {sortProjectsByOrder(projects).map((project) => (
          <li key={project.id}>
            <Checkbox
              label={`${project.name} · ${PROJECT_STAGE_LABELS[project.stage]}`}
              checked={selected.includes(project.id)}
              onChange={(e) => toggle(project.id, e.target.checked)}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <fieldset
      className="kit-field kit-field--full admin-post-projects"
      aria-describedby={hintId}
    >
      <legend>Part of project</legend>
      <span id={hintId} className="kit-hint">
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
  previewPage: { href: string; onOpen: () => void };
};

export function PostEditorBody({
  draft,
  setField,
  onUploadImages,
  previewPage,
}: BodyProps) {
  return (
    <MarkdownBodyEditor
      value={draft.bodyMarkdown}
      onChange={(value) => setField('bodyMarkdown', value)}
      onUploadImages={onUploadImages}
      previewPage={previewPage}
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
  return (
    <h1 className="admin-editor-title">
      <TextArea
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
