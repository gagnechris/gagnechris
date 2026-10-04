import { useEffect, useId, type FormEvent, type RefObject } from 'react';
import type { components } from '@gagnechris/api-client';
import {
  MAX_SLUG_LENGTH,
  PROJECT_STAGE_LABELS,
  sortProjectsByOrder,
} from '@gagnechris/shared';
import { Field, TextArea, TextInput } from '../kit/Field';
import { MarkdownBodyEditor } from '../kit/markdown/MarkdownBodyEditor';

export type PostDraftFields = {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  tagsText: string;
  projectIds: string[];
  coverImage: string;
};

type Project = components['schemas']['Project'];

type MetaProps = {
  draft: PostDraftFields;
  setField: <K extends keyof PostDraftFields>(
    key: K,
    value: PostDraftFields[K],
  ) => void;
  setSlugManual: (manual: boolean) => void;
  onSave: () => void;
  /** `undefined` while loading. */
  projects: readonly Project[] | undefined;
  projectsError: string | null;
};

export function PostEditorMeta({
  draft,
  setField,
  setSlugManual,
  onSave,
  projects,
  projectsError,
}: MetaProps) {
  return (
    <details className="admin-details">
      <summary>Details</summary>
      <form
        className="admin-editor-fields admin-editor-fields--meta"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onSave();
        }}
      >
        <Field label="Slug">
          <TextInput
            value={draft.slug}
            maxLength={MAX_SLUG_LENGTH}
            onChange={(e) => {
              setSlugManual(true);
              setField('slug', e.target.value);
            }}
          />
        </Field>
        <Field label="Tags (comma-separated)">
          <TextInput
            value={draft.tagsText}
            onChange={(e) => setField('tagsText', e.target.value)}
          />
        </Field>
        <PostProjectsField
          projects={projects}
          error={projectsError}
          selected={draft.projectIds}
          onChange={(ids) => setField('projectIds', ids)}
        />
        <Field label="Excerpt" fullWidth>
          <TextArea
            rows={2}
            value={draft.excerpt}
            onChange={(e) => setField('excerpt', e.target.value)}
          />
        </Field>
        <Field label="Cover image URL" fullWidth>
          <TextInput
            value={draft.coverImage}
            onChange={(e) => setField('coverImage', e.target.value)}
            placeholder="/media/… or https://…"
          />
        </Field>
      </form>
    </details>
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
  mobilePane: 'edit' | 'preview';
  setMobilePane: (pane: 'edit' | 'preview') => void;
  setField: <K extends keyof PostDraftFields>(
    key: K,
    value: PostDraftFields[K],
  ) => void;
  onUploadImages: (files: File[]) => Promise<string[]>;
};

export function PostEditorBody({
  draft,
  mobilePane,
  setMobilePane,
  setField,
  onUploadImages,
}: BodyProps) {
  return (
    <MarkdownBodyEditor
      value={draft.bodyMarkdown}
      onChange={(value) => setField('bodyMarkdown', value)}
      mobilePane={mobilePane}
      setMobilePane={setMobilePane}
      onUploadImages={onUploadImages}
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
