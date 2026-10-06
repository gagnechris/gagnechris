import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { renderResumePrerenderHtml } from '@gagnechris/shared/render';
import { resumeResource, type Resume } from '@gagnechris/app-core';
import { ResumeEditorForm } from './ResumeEditorForm';
import { publicUrl, withPublicUrls } from './publicUrl';
import {
  createResumeContentBuilder,
  emptyResumeDraft,
  hasExperienceRangeError,
  RESUME_PDF_PATH,
  resumeDraftFromResume,
  resumePayload,
  resumeRoleEndId,
  type ExperienceDraft,
  type ResumeContentBuilder,
  type ResumeDraftFields,
} from './resumeDraft';
import { EditorFrame } from './editor/EditorFrame';
import { useAdminEntityEditor } from './editor/useAdminEntityEditor';
import { useDraftFields } from './editor/useDraftFields';
import '../pages/Resume.css';

const ResumePreview = ({
  resume,
  draft,
  content,
}: {
  resume: Resume;
  draft: ResumeDraftFields;
  content: ResumeContentBuilder;
}) => {
  const deferred = useDeferredValue(draft);
  const html = useMemo(
    () =>
      renderResumePrerenderHtml({
        ...resume,
        name: deferred.name,
        pdfPath: RESUME_PDF_PATH,
        content: content.preview(deferred, resume),
      }),
    [resume, deferred, content],
  );
  return (
    <div
      className="resume-page admin-resume-preview"
      dangerouslySetInnerHTML={{ __html: withPublicUrls(html) }}
    />
  );
};

const AdminResumePage = () => {
  const [content] = useState(createResumeContentBuilder);
  const [publishBlockedRoleId, setPublishBlockedRoleId] = useState<
    string | null
  >(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  // A fresh object each time, so asking again for the same role refocuses.
  const [endFocus, setEndFocus] = useState<{ roleId: string } | null>(null);
  const focusRoleEnd = (roleId: string) => {
    setEditingRoleId(roleId);
    setEndFocus({ roleId });
  };

  useEffect(() => {
    if (endFocus) {
      document.getElementById(resumeRoleEndId(endFocus.roleId))?.focus();
    }
  }, [endFocus]);
  const editor = useAdminEntityEditor({
    resource: resumeResource,
    params: {},
    initialDraft: emptyResumeDraft(),
    toDraft: resumeDraftFromResume,
    getEntityId: () => 'resume',
    toPayload: (current, saved) => resumePayload(current, content, saved),
    subject: 'the resume',
    loadErrorFallback: 'Could not load resume.',
    unpublishConfirm:
      'Unpublish the resume? The live page keeps the last published HTML.',
    discardConfirm:
      'Discard unpublished edits and restore the last published resume?',
    beforePublish: (): boolean => {
      const role = undatedErrors[0];
      setPublishBlockedRoleId(role?.id ?? null);
      if (role) focusRoleEnd(role.id);
      return !role;
    },
  });
  const { draft, save, actionBarProps, entity } = editor;
  const { setField } = useDraftFields(editor);

  const undatedErrors: ExperienceDraft[] = entity
    ? content.undatedRangeErrors(draft, entity)
    : [];
  const blockedRole = undatedErrors.find(
    (item) => item.id === publishBlockedRoleId,
  );

  return (
    <EditorFrame
      editor={editor}
      loadingLabel="Loading resume…"
      leading={<h1>Resume</h1>}
      viewLiveHref={() => publicUrl('/resume')}
      actionBar={{
        // An invalid range is saved as the role's last saved dates, so a clean
        // save does not mean everything typed is on the server.
        dirty: actionBarProps.dirty || hasExperienceRangeError(draft),
      }}
      notices={
        blockedRole ? (
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
        ) : null
      }
    >
      {(resume) => (
        <>
          <div className="admin-editor-split">
            <ResumeEditorForm
              draft={draft}
              setField={setField}
              hasSavedDates={(item) =>
                content.savedDates(item, resume) !== null
              }
              onSave={() => void save()}
              editingRoleId={editingRoleId}
              setEditingRoleId={setEditingRoleId}
            />

            <div className="admin-editor-split__preview">
              <h2 className="admin-preview-title">Preview</h2>
              <ResumePreview resume={resume} draft={draft} content={content} />
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

export default AdminResumePage;
