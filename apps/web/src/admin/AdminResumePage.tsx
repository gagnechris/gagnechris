import { useEffect, useState } from 'react';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import { renderResumePrerenderHtml } from '@gagnechris/shared/render';
import { resumeResource } from '@gagnechris/app-core';
import { EditorActionBar } from '../workspace/ui/EditorActionBar';
import { ResumeEditorForm } from './ResumeEditorForm';
import {
  createResumeContentBuilder,
  hasExperienceRangeError,
  resumeDraftFromResume,
  resumeRoleEndId,
  type ResumeDraftFields,
} from './resumeDraft';
import { useVersionedEntityEditor } from '../workspace/useVersionedEntityEditor';
import '../pages/Resume.css';

const emptyResumeDraft = (): ResumeDraftFields =>
  resumeDraftFromResume({
    ...DEFAULT_RESUME,
    status: 'draft',
    publishedAt: null,
    updatedAt: '',
    version: 0,
    hasUnpublishedChanges: false,
  });

const AdminResumePage = () => {
  const [content] = useState(createResumeContentBuilder);
  const [publishBlockedRoleId, setPublishBlockedRoleId] = useState<
    string | null
  >(null);
  const {
    draft,
    updateDraft,
    entity: resume,
    save,
    saveError,
    loadError,
    isLoading,
    actionBarProps,
    publishRef,
    runPublish,
  } = useVersionedEntityEditor({
    resource: resumeResource,
    params: {},
    initialDraft: emptyResumeDraft(),
    toDraft: resumeDraftFromResume,
    getEntityId: () => 'resume',
    toPayload: (current) => ({
      name: current.name.trim() || 'Chris Gagne',
      pdfPath: '/resume.pdf',
      content: content.payload(current),
    }),
    conflictMessage:
      'Conflict — another save updated the resume. Reload and try again.',
    loadErrorFallback: 'Could not load resume.',
    unpublishConfirm:
      'Unpublish the resume? The live page keeps the last published HTML.',
    discardConfirm:
      'Discard unpublished edits and restore the last published resume?',
  });

  const undatedErrors = content.undatedRangeErrors(draft);
  const blockedRole = undatedErrors.find(
    (item) => item.id === publishBlockedRoleId,
  );

  const focusRoleEnd = (roleId: string) =>
    document.getElementById(resumeRoleEndId(roleId))?.focus();

  const guardedPublish = async () => {
    const role = undatedErrors[0];
    if (!role) {
      setPublishBlockedRoleId(null);
      await runPublish();
      return;
    }
    setPublishBlockedRoleId(role.id);
    focusRoleEnd(role.id);
  };
  // The shell's Mod-Enter reads publishRef, which the editor refreshes on every
  // render; this effect runs after that one, so the shortcut is guarded too.
  useEffect(() => {
    publishRef.current = guardedPublish;
  });

  const setField = <K extends keyof ResumeDraftFields>(
    key: K,
    value:
      | ResumeDraftFields[K]
      | ((prev: ResumeDraftFields[K]) => ResumeDraftFields[K]),
  ) => {
    updateDraft((prev) => ({
      ...prev,
      [key]:
        typeof value === 'function'
          ? (value as (field: ResumeDraftFields[K]) => ResumeDraftFields[K])(
              prev[key],
            )
          : value,
    }));
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

  if (isLoading || !resume) {
    return (
      <section className="admin-panel">
        <p>Loading resume…</p>
      </section>
    );
  }

  const previewHtml = renderResumePrerenderHtml({
    ...resume,
    name: draft.name,
    pdfPath: '/resume.pdf',
    content: content.preview(draft),
  });

  return (
    <section className="admin-panel admin-panel--editor">
      <EditorActionBar
        leading={<h1>Resume</h1>}
        {...actionBarProps}
        // An invalid range is saved as the role's last saved dates, so a clean
        // save does not mean everything typed is on the server.
        dirty={actionBarProps.dirty || hasExperienceRangeError(draft)}
        onPublish={() => void guardedPublish()}
        viewLiveHref="/resume"
      />

      {blockedRole ? (
        <p className="admin-panel__error" role="alert">
          Not published: {blockedRole.title.trim() || 'a new role'} has an End
          month before its Start month and no saved dates yet.{' '}
          <a
            href={`#${resumeRoleEndId(blockedRole.id)}`}
            onClick={(event) => {
              event.preventDefault();
              focusRoleEnd(blockedRole.id);
            }}
          >
            Fix End month
          </a>
        </p>
      ) : null}

      {saveError ? (
        <p className="admin-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="admin-editor-split">
        <ResumeEditorForm
          draft={draft}
          setField={setField}
          hasSavedDates={(item) => content.savedDates(item) !== null}
          onSave={() => void save()}
        />

        <div className="admin-editor-split__preview">
          <h2 className="admin-preview-title">Preview</h2>
          <div
            className="resume-page admin-resume-preview"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </div>
      <p className="admin-hint">
        ⌘S / Ctrl+S saves · ⌘⏎ / Ctrl+Enter publishes
      </p>
    </section>
  );
};

export default AdminResumePage;
