import { type FormEvent } from 'react';
import { renderHomePrerenderHtml } from '@gagnechris/shared/render';
import { homeResource, mergeEditorSeo, type Home } from '@gagnechris/app-core';
import { EditorActionBar } from '../workspace/ui/EditorActionBar';
import { Field, TextArea, TextInput } from '../workspace/ui/Field';
import { useVersionedEntityEditor } from '../workspace/useVersionedEntityEditor';
import { publicUrl, withPublicLinks } from './publicUrl';

type DraftFields = {
  name: string;
  title: string;
  about: string;
  seoTitle: string;
  seoDescription: string;
};

const emptyHomeDraft = (): DraftFields => ({
  name: '',
  title: '',
  about: '',
  seoTitle: '',
  seoDescription: '',
});

const fromHome = (home: Home): DraftFields => ({
  name: home.name,
  title: home.title,
  about: home.about,
  seoTitle: home.seo?.title ?? '',
  seoDescription: home.seo?.description ?? '',
});

const toHomePayload = (
  draft: DraftFields,
  existingSeo: Home['seo'],
): Pick<Home, 'name' | 'title' | 'about' | 'seo'> => ({
  name: draft.name.trim() || 'Chris Gagne',
  title: draft.title.trim(),
  about: draft.about,
  seo: mergeEditorSeo(existingSeo, draft),
});

const AdminHomePage = () => {
  const {
    draft,
    updateDraft,
    entity: home,
    save,
    saveError,
    loadError,
    isLoading,
    actionBarProps,
  } = useVersionedEntityEditor({
    resource: homeResource,
    params: {},
    initialDraft: emptyHomeDraft(),
    toDraft: fromHome,
    getEntityId: () => 'home',
    toPayload: (current, entity) => toHomePayload(current, entity.seo),
    conflictMessage:
      'Conflict — another save updated the home page. Reload and try again.',
    loadErrorFallback: 'Could not load home content.',
    unpublishConfirm:
      'Unpublish the home page? The live page keeps the last published HTML.',
    discardConfirm:
      'Discard unpublished edits and restore the last published home content?',
  });

  const setField = (key: keyof DraftFields, value: string) => {
    updateDraft((prev) => ({ ...prev, [key]: value }));
  };

  if (loadError) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          {loadError}
        </p>
      </section>
    );
  }

  if (isLoading || !home) {
    return (
      <section className="admin-panel">
        <p>Loading home content…</p>
      </section>
    );
  }

  const previewHtml = renderHomePrerenderHtml({
    ...home,
    ...toHomePayload(draft, home.seo),
  });

  return (
    <section className="admin-panel admin-panel--editor">
      <EditorActionBar
        leading={<h1>Home</h1>}
        {...actionBarProps}
        viewLiveHref={publicUrl('/')}
      />

      {saveError ? (
        <p className="admin-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="admin-editor-split">
        <form
          className="admin-editor-fields"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Name">
            <TextInput
              value={draft.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </Field>
          <Field label="Title">
            <TextInput
              value={draft.title}
              onChange={(e) => setField('title', e.target.value)}
            />
          </Field>
          <Field
            label="About Me"
            hint="Blank lines start a new paragraph. Quick Links and the profile photo are not editable yet."
          >
            <TextArea
              rows={8}
              value={draft.about}
              onChange={(e) => setField('about', e.target.value)}
            />
          </Field>
          <Field label="SEO title (optional)">
            <TextInput
              value={draft.seoTitle}
              onChange={(e) => setField('seoTitle', e.target.value)}
              placeholder={`${draft.name} - ${draft.title}`}
            />
          </Field>
          <Field
            label="SEO description (optional)"
            hint="Defaults to the first 200 characters of About Me."
          >
            <TextArea
              rows={3}
              value={draft.seoDescription}
              onChange={(e) => setField('seoDescription', e.target.value)}
            />
          </Field>
        </form>

        <div className="admin-editor-split__preview">
          <h2 className="admin-preview-title">Preview</h2>
          <div
            className="admin-home-preview"
            dangerouslySetInnerHTML={{ __html: withPublicLinks(previewHtml) }}
          />
        </div>
      </div>
      <p className="admin-hint">
        ⌘S / Ctrl+S saves · ⌘⏎ / Ctrl+Enter publishes
      </p>
    </section>
  );
};

export default AdminHomePage;
