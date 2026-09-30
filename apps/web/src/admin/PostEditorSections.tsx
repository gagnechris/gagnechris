import type { FormEvent, RefObject } from 'react';
import { MAX_SLUG_LENGTH } from '@gagnechris/shared';
import MarkdownEditor from '../components/markdown/MarkdownEditor';
import MarkdownPreview from '../components/markdown/MarkdownPreview';
import { Field, TextArea, TextInput } from '../ui/Field';
import '../components/markdown/markdown.css';

export type PostDraftFields = {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  tagsText: string;
  coverImage: string;
};

type MetaProps = {
  draft: PostDraftFields;
  setField: <K extends keyof PostDraftFields>(
    key: K,
    value: PostDraftFields[K],
  ) => void;
  setSlugManual: (manual: boolean) => void;
  onSave: () => void;
};

export function PostEditorMeta({
  draft,
  setField,
  setSlugManual,
  onSave,
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
    <>
      <div className="markdown-workspace">
        <div className="markdown-tabs" role="tablist" aria-label="Editor view">
          <button
            type="button"
            role="tab"
            className="markdown-tabs__btn"
            aria-selected={mobilePane === 'edit'}
            onClick={() => setMobilePane('edit')}
          >
            Edit
          </button>
          <button
            type="button"
            role="tab"
            className="markdown-tabs__btn"
            aria-selected={mobilePane === 'preview'}
            onClick={() => setMobilePane('preview')}
          >
            Preview
          </button>
        </div>
        <div className="markdown-split" data-pane={mobilePane}>
          <MarkdownEditor
            value={draft.bodyMarkdown}
            onChange={(value) => setField('bodyMarkdown', value)}
            onUploadImages={onUploadImages}
          />
          <MarkdownPreview markdown={draft.bodyMarkdown} />
        </div>
      </div>
      <p className="admin-hint">
        ⌘S / Ctrl+S saves · ⌘⏎ / Ctrl+Enter publishes · paste or drop images
        into the editor
      </p>
    </>
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
