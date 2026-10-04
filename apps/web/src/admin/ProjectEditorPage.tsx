import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EMPTY_SLUG_FALLBACK, slugify } from '@gagnechris/shared';
import {
  projectResource,
  useDeleteProjectMutation,
  useGetApiClient,
} from '@gagnechris/app-core';
import { Button } from '../workspace/ui/Button';
import { EditorActionBar } from '../workspace/ui/EditorActionBar';
import { MarkdownBodyEditor } from './MarkdownBodyEditor';
import { ProjectEditorFields } from './ProjectEditorFields';
import {
  emptyProjectDraft,
  hasProjectDraftErrors,
  isPlaceholderSlug,
  projectDraftFromProject,
  projectPayload,
  type ProjectDraftFields,
} from './projectDraft';
import { uploadImages } from './uploadImages';
import { useVersionedEntityEditor } from '../workspace/useVersionedEntityEditor';
import './projects.css';

export default function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          Missing project id.
        </p>
        <Link to="/projects">← Back to projects</Link>
      </section>
    );
  }
  return <ProjectEditorPageInner key={projectId} projectId={projectId} />;
}

function ProjectEditorPageInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const getClient = useGetApiClient();
  const deleteMutation = useDeleteProjectMutation();
  const [slugManual, setSlugManual] = useState(false);
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit');
  const [publishBlocked, setPublishBlocked] = useState(false);

  const {
    draft,
    updateDraft,
    entity: project,
    busy,
    save,
    saveError,
    setSaveError,
    loadError,
    isLoading,
    actionBarProps,
    publishRef,
    runPublish,
    runDelete,
  } = useVersionedEntityEditor({
    resource: projectResource,
    params: { id: projectId },
    initialDraft: emptyProjectDraft(),
    toDraft: projectDraftFromProject,
    getEntityId: (entity) => entity.id,
    toPayload: projectPayload,
    conflictMessage:
      'Conflict — another save updated this project. Reload and try again.',
    slugTakenMessage: 'That slug is already taken. Choose a different slug.',
    loadErrorFallback: 'Could not load project.',
    unpublishConfirm:
      'Unpublish this project? It will leave the public Projects page.',
    discardConfirm:
      'Discard unpublished edits and restore the last published project?',
    onHydrate: (entity) => setSlugManual(!isPlaceholderSlug(entity.slug)),
    delete: {
      confirm:
        'Soft-delete this project? You can recover it later via the API.',
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id: projectId, version });
      },
      onDeleted: () => {
        void navigate('/projects');
      },
    },
  });

  const draftInvalid = hasProjectDraftErrors(draft);

  const guardedPublish = async () => {
    if (draftInvalid) {
      setPublishBlocked(true);
      return;
    }
    setPublishBlocked(false);
    await runPublish();
  };
  // The shell's Mod-Enter reads publishRef, which the editor refreshes on every
  // render; this effect runs after that one, so the shortcut is guarded too.
  useEffect(() => {
    publishRef.current = guardedPublish;
  });

  const setField = <K extends keyof ProjectDraftFields>(
    key: K,
    value:
      | ProjectDraftFields[K]
      | ((prev: ProjectDraftFields[K]) => ProjectDraftFields[K]),
  ) => {
    updateDraft((prev) => {
      const resolved =
        typeof value === 'function'
          ? (value as (field: ProjectDraftFields[K]) => ProjectDraftFields[K])(
              prev[key],
            )
          : value;
      const next = { ...prev, [key]: resolved };
      if (key === 'name' && !slugManual) {
        next.slug = slugify(String(resolved)) || EMPTY_SLUG_FALLBACK;
      }
      return next;
    });
  };

  const handleUploadImages = useCallback(
    async (files: File[]) => {
      try {
        setSaveError(null);
        return await uploadImages(getClient(), files);
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : 'Image upload failed',
        );
        return [];
      }
    },
    [getClient, setSaveError],
  );

  if (loadError) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          {loadError}
        </p>
        <Link to="/projects">← Back to projects</Link>
      </section>
    );
  }

  if (isLoading || !project) {
    return (
      <section className="admin-panel">
        <p>Loading editor…</p>
      </section>
    );
  }

  return (
    <section className="admin-panel admin-panel--editor">
      <EditorActionBar
        leading={
          <Link to="/projects" className="admin-back">
            ← Projects
          </Link>
        }
        {...actionBarProps}
        // Invalid fields are saved as their last saved values, so a clean save
        // does not mean everything typed is on the server.
        dirty={actionBarProps.dirty || draftInvalid}
        onPublish={() => void guardedPublish()}
        viewLiveHref={
          project.status === 'published'
            ? (project.href ?? `/projects/${project.slug}`)
            : null
        }
        extraActions={
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => void runDelete()}
          >
            Delete
          </Button>
        }
      />

      {publishBlocked && draftInvalid ? (
        <p className="admin-panel__error" role="alert">
          Not published: fix the highlighted fields first.
        </p>
      ) : null}

      {saveError ? (
        <p className="admin-panel__error" role="alert">
          {saveError}
        </p>
      ) : null}

      <ProjectEditorFields
        draft={draft}
        setField={setField}
        setSlugManual={setSlugManual}
        onSave={() => void save()}
        onUploadPreview={async (file) => {
          const [path] = await uploadImages(getClient(), [file]);
          if (!path) throw new Error('Image upload failed');
          return path;
        }}
      />

      <h2 className="admin-project-section">Body</h2>
      <MarkdownBodyEditor
        value={draft.bodyMarkdown}
        onChange={(value) => setField('bodyMarkdown', value)}
        mobilePane={mobilePane}
        setMobilePane={setMobilePane}
        onUploadImages={handleUploadImages}
      />
    </section>
  );
}
