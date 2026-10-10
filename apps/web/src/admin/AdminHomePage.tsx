import { useDeferredValue, useMemo, type FormEvent } from 'react';
import { renderHomePrerenderHtml } from '@gagnechris/public-ui/server';
import { homeResource, type Home } from '@gagnechris/app-core';
import { Field, TextArea, TextInput } from '../kit/Field';
import { publicUrl, withPublicUrls } from './publicUrl';
import {
  emptyHomeDraft,
  homeDraftFromHome,
  homePayload,
  type HomeDraftFields,
} from './homeDraft';
import { EditorFrame } from './editor/EditorFrame';
import { useAdminEntityEditor } from './editor/useAdminEntityEditor';
import { useDraftFields } from './editor/useDraftFields';

const HomePreview = ({
  home,
  draft,
}: {
  home: Home;
  draft: HomeDraftFields;
}) => {
  const deferred = useDeferredValue(draft);
  const html = useMemo(
    () => renderHomePrerenderHtml({ ...home, ...homePayload(deferred, home) }),
    [home, deferred],
  );
  return (
    <div
      className="admin-home-preview"
      dangerouslySetInnerHTML={{ __html: withPublicUrls(html) }}
    />
  );
};

const AdminHomePage = () => {
  const editor = useAdminEntityEditor({
    resource: homeResource,
    params: {},
    initialDraft: emptyHomeDraft(),
    toDraft: homeDraftFromHome,
    getEntityId: () => 'home',
    toPayload: homePayload,
    subject: 'the home page',
    loadErrorFallback: 'Could not load home content.',
    unpublishConfirm:
      'Unpublish the home page? The live page keeps the last published HTML.',
    discardConfirm:
      'Discard unpublished edits and restore the last published home content?',
  });
  const { draft, save } = editor;
  const { setField } = useDraftFields(editor);

  return (
    <EditorFrame
      editor={editor}
      loadingLabel="Loading home content…"
      leading={<h1>Home</h1>}
      viewLiveHref={() => publicUrl('/')}
    >
      {(home) => (
        <>
          <div className="admin-editor-split">
            <form
              className="admin-form"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void save();
              }}
            >
              <section className="admin-form-section">
                <h2 className="admin-form-section__title">Profile</h2>
                <div className="admin-form-card">
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
                </div>
                <p className="admin-hint">
                  Quick Links and the profile photo are not editable yet.
                </p>
              </section>
              <section className="admin-form-section">
                <h2 className="admin-form-section__title">About me</h2>
                <div className="admin-form-card">
                  <Field
                    label="About Me"
                    hint="Blank lines start a new paragraph."
                  >
                    <TextArea
                      rows={8}
                      value={draft.about}
                      onChange={(e) => setField('about', e.target.value)}
                    />
                  </Field>
                </div>
              </section>
              <section className="admin-form-section">
                <h2 className="admin-form-section__title">
                  Search and sharing
                </h2>
                <div className="admin-form-card">
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
                      onChange={(e) =>
                        setField('seoDescription', e.target.value)
                      }
                    />
                  </Field>
                </div>
              </section>
            </form>

            <div className="admin-editor-split__preview">
              <h2 className="admin-preview-title">Preview</h2>
              <HomePreview home={home} draft={draft} />
            </div>
          </div>
          <p className="admin-hint">
            ⌘S / Ctrl+S saves · ⌘⏎ / Ctrl+Enter publishes
          </p>
        </>
      )}
    </EditorFrame>
  );
};

export default AdminHomePage;
