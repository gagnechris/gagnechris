import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  projectResource,
  useDeleteProjectMutation,
} from '@gagnechris/app-core';
import { MarkdownBodyEditor } from '../kit/markdown/MarkdownBodyEditor';
import { ProjectEditorFields } from './ProjectEditorFields';
import { publicImageSrc, publicUrl } from './publicUrl';
import {
  emptyProjectDraft,
  hasProjectDraftErrors,
  hasProjectPublishErrors,
  projectDraftFromProject,
  projectPayload,
} from './projectDraft';
import { BodyPreview } from './editor/BodyPreview';
import { EditorFrame, EditorNotice } from './editor/EditorFrame';
import { useAdminEntityEditor } from './editor/useAdminEntityEditor';
import { useDraftFields } from './editor/useDraftFields';
import { useImageUpload } from './editor/useImageUpload';
import './projects.css';

const BACK = { to: '/projects', label: '← Back to projects' };

export default function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) {
    return <EditorNotice message="Missing project id." back={BACK} />;
  }
  return <ProjectEditorPageInner key={projectId} projectId={projectId} />;
}

function ProjectEditorPageInner({ projectId }: { projectId: string }) {
  const deleteMutation = useDeleteProjectMutation();
  const [publishBlocked, setPublishBlocked] = useState(false);

  const editor = useAdminEntityEditor({
    resource: projectResource,
    params: { id: projectId },
    initialDraft: emptyProjectDraft(),
    toDraft: projectDraftFromProject,
    getEntityId: (entity) => entity.id,
    toPayload: projectPayload,
    subject: 'this project',
    uniqueSlug: true,
    loadErrorFallback: 'Could not load project.',
    unpublishConfirm:
      'Unpublish this project? It will leave the public Projects page.',
    discardConfirm:
      'Discard unpublished edits and restore the last published project?',
    delete: {
      confirm:
        'Soft-delete this project? You can recover it later via the API.',
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id: projectId, version });
      },
      redirectTo: '/projects',
    },
    beforePublish: () => {
      setPublishBlocked(publishInvalid);
      return !publishInvalid;
    },
  });
  const { draft, save, actionBarProps } = editor;
  const { setField, setSlugManual } = useDraftFields(editor, {
    slugFrom: 'name',
  });
  const { uploadImage, uploadBodyImages } = useImageUpload(editor.setSaveError);

  const draftInvalid = hasProjectDraftErrors(draft);
  const publishInvalid = hasProjectPublishErrors(draft);

  return (
    <EditorFrame
      editor={editor}
      back={BACK}
      loadingLabel="Loading editor…"
      leading={
        <Link to="/projects" className="admin-back">
          ← Projects
        </Link>
      }
      viewLiveHref={(project) =>
        project.status === 'published'
          ? publicUrl(project.href ?? `/projects/${project.slug}`)
          : null
      }
      actionBar={{
        // Invalid fields are saved as their last saved values, so a clean save
        // does not mean everything typed is on the server.
        dirty: actionBarProps.dirty || draftInvalid,
      }}
      notices={
        publishBlocked && publishInvalid ? (
          <p className="admin-panel__error" role="alert">
            Not published: fix the highlighted fields first.
          </p>
        ) : null
      }
    >
      {() => (
        <>
          <ProjectEditorFields
            draft={draft}
            setField={setField}
            setSlugManual={setSlugManual}
            onSave={() => void save()}
            onUploadPreview={uploadImage}
          />

          <h2 className="admin-project-section">Body</h2>
          <MarkdownBodyEditor
            value={draft.bodyMarkdown}
            onChange={(value) => setField('bodyMarkdown', value)}
            onUploadImages={uploadBodyImages}
            preview={
              <BodyPreview kind="project" markdown={draft.bodyMarkdown} />
            }
            resolveImageSrc={publicImageSrc}
          />
        </>
      )}
    </EditorFrame>
  );
}
