import { useCallback, useEffect, useRef, useState } from 'react';
import { renderResumePrerenderHtml } from '@gagnechris/shared/resume';
import type { components } from '@gagnechris/api-client';
import { EditorActionBar } from '../ui/EditorActionBar';
import { ResumeEditorForm } from './ResumeEditorForm';
import {
  resumeContentFromDraft,
  resumeDraftFromResume,
  type ResumeDraftFields,
} from './resumeDraft';
import { ApiError, updateResume } from './query/api';
import {
  useResumeLifecycleMutators,
  useResumeQuery,
  useSetResumeCache,
} from './query/resume';
import { useDraftPublishEditor } from './useDraftPublishEditor';
import { useNullableDraftUpdater } from './useDraftUpdater';
import { useQueuedAutosave } from './useQueuedAutosave';
import '../pages/Resume.css';

type Resume = components['schemas']['Resume'];

const AdminResumePage = () => {
  const { data: resume, error: queryError, isPending } = useResumeQuery();
  const setResumeCache = useSetResumeCache();
  const {
    publish: publishRequest,
    unpublish: unpublishRequest,
    discard: discardRequest,
  } = useResumeLifecycleMutators();

  const [draft, setDraft] = useState<ResumeDraftFields | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const versionRef = useRef(0);

  if (resume && !hydrated) {
    setHydrated(true);
    setDraft(resumeDraftFromResume(resume));
    setDirty(false);
  }

  useEffect(() => {
    if (resume) versionRef.current = resume.version;
  }, [resume]);

  const performSave = useCallback(
    async (current: ResumeDraftFields, version: number) => {
      try {
        const entity = await updateResume({
          version,
          name: current.name.trim() || 'Chris Gagne',
          pdfPath: '/resume.pdf',
          content: resumeContentFromDraft(current),
        });
        return { ok: true as const, entity };
      } catch (err) {
        return {
          ok: false as const,
          status: err instanceof ApiError ? err.status : 0,
        };
      }
    },
    [],
  );

  const getVersion = useCallback((entity: Resume) => entity.version, []);
  const onSaved = useCallback(
    (entity: Resume) => setResumeCache(entity),
    [setResumeCache],
  );
  const onReplaceDraft = useCallback(
    (entity: Resume) => {
      setResumeCache(entity);
      setDraft(resumeDraftFromResume(entity));
    },
    [setResumeCache],
  );

  const autosave = useQueuedAutosave({
    draft,
    dirty,
    setDirty,
    versionRef,
    getVersion,
    performSave,
    onSaved,
    conflictMessage:
      'Conflict — another save updated the resume. Reload and try again.',
  });
  const { save, saveState, saveError, bumpEdit } = autosave;

  const publishMutate = useCallback(
    () => publishRequest({ version: versionRef.current }),
    [publishRequest],
  );
  const unpublishMutate = useCallback(
    () => unpublishRequest({ version: versionRef.current }),
    [unpublishRequest],
  );
  const discardMutate = useCallback(
    () => discardRequest({ version: versionRef.current }),
    [discardRequest],
  );

  const { busy, runPublish, runUnpublish, runDiscard } = useDraftPublishEditor({
    autosave,
    dirty,
    setDirty,
    versionRef,
    getVersion,
    onEntityMeta: onSaved,
    onReplaceDraft,
    publish: publishMutate,
    unpublish: unpublishMutate,
    discard: discardMutate,
    unpublishConfirm:
      'Unpublish the resume? The live page keeps the last published HTML.',
    discardConfirm:
      'Discard unpublished edits and restore the last published resume?',
  });

  const updateDraft = useNullableDraftUpdater(setDraft, bumpEdit, setDirty);
  const setField = <K extends keyof ResumeDraftFields>(
    key: K,
    value: ResumeDraftFields[K],
  ) => {
    updateDraft((prev) => ({ ...prev, [key]: value }));
  };

  const loadError =
    queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? 'Could not load resume.'
        : null;

  if (loadError) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          {loadError}
        </p>
      </section>
    );
  }

  if (isPending || !resume || !draft) {
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
    content: resumeContentFromDraft(draft),
  });

  return (
    <section className="admin-panel admin-panel--editor">
      <EditorActionBar
        leading={<h1>Resume</h1>}
        status={resume.status}
        hasUnpublishedChanges={resume.hasUnpublishedChanges}
        saveState={saveState}
        dirty={dirty}
        busy={busy}
        viewLiveHref="/resume"
        onPublish={() => void runPublish()}
        onUnpublish={() => void runUnpublish()}
        onDiscard={() => void runDiscard()}
        onSave={() => void save()}
      />

      {saveError ? (
        <p className="admin-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="admin-editor-split">
        <ResumeEditorForm
          draft={draft}
          setField={setField}
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
