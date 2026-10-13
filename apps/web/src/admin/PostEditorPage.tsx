import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  emptyPostDraft,
  postDraftFromPost,
  postPayload,
  postResource,
  useDeletePostMutation,
  useProjectsQuery,
} from '@gagnechris/app-core';
import {
  PostEditorBody,
  PostEditorDetails,
  PostEditorTitle,
} from './PostEditorSections';
import { publicUrl } from './publicUrl';
import { BottomSheet } from '../kit/BottomSheet';
import { Button } from '../kit/Button';
import { PHONE_QUERY, useMediaQuery } from '../kit/useMediaQuery';
import { EditorError, EditorFrame, EditorNotice } from './editor/EditorFrame';
import { useAdminEntityEditor } from './editor/useAdminEntityEditor';
import { useDraftFields } from './editor/useDraftFields';
import { useImageUpload } from './editor/useImageUpload';
import { useDraftPreview } from './preview/draftPreview';

const BACK = { to: '/', label: '← Back to posts' };

/** Outer shell keys the editor by postId so A→B navigation drops pending debounce. */
export default function PostEditorPage() {
  const { postId } = useParams<{ postId: string }>();
  if (!postId) {
    return <EditorNotice message="Missing post id." back={BACK} />;
  }
  return <PostEditorPageInner key={postId} postId={postId} />;
}

function PostEditorPageInner({ postId }: { postId: string }) {
  const deleteMutation = useDeletePostMutation();
  const projectsQuery = useProjectsQuery();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const phone = useMediaQuery(PHONE_QUERY);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const editor = useAdminEntityEditor({
    resource: postResource,
    params: { id: postId },
    initialDraft: emptyPostDraft(),
    toDraft: postDraftFromPost,
    getEntityId: (entity) => entity.id,
    toPayload: postPayload,
    subject: 'this post',
    uniqueSlug: true,
    loadErrorFallback: 'Could not load post.',
    unpublishConfirm:
      'Unpublish this post? It will leave the public Posts page.',
    discardConfirm:
      'Discard unpublished edits and restore the last published post?',
    delete: {
      confirm: 'Soft-delete this post? You can recover it later via the API.',
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id: postId, version });
      },
      redirectTo: '/',
    },
  });
  const { draft, save, saveError } = editor;
  const previewPage = useDraftPreview('post', postId, {
    title: draft.title,
    markdown: draft.bodyMarkdown,
  });
  const { setField, slugManual, setSlugManual } = useDraftFields(editor, {
    slugFrom: 'title',
  });
  const { uploadImage, uploadBodyImages } = useImageUpload(editor.setSaveError);

  const details = (
    <PostEditorDetails
      draft={draft}
      setField={setField}
      slugManual={slugManual}
      setSlugManual={setSlugManual}
      onSave={() => void save()}
      onUploadImage={uploadImage}
      projects={projectsQuery.data}
      projectsError={projectsQuery.error ? 'Could not load projects.' : null}
    />
  );

  return (
    <EditorFrame
      editor={editor}
      back={BACK}
      loadingLabel="Loading editor…"
      leading={
        <Link to="/" className="workspace-back">
          ← Posts
        </Link>
      }
      viewLiveHref={(post) =>
        post.status === 'published' ? publicUrl(`/posts/${post.slug}`) : null
      }
      actionBar={
        phone
          ? {
              menuActions: (
                <Button onClick={() => setDetailsOpen(true)}>
                  Post details
                </Button>
              ),
            }
          : undefined
      }
      placesSaveError
    >
      {() => (
        <div className="admin-post-editor">
          <div className="admin-post-editor__main">
            <PostEditorTitle
              title={draft.title}
              titleRef={titleRef}
              onChange={(value) => setField('title', value)}
            />

            <EditorError message={saveError} />

            <PostEditorBody
              draft={draft}
              setField={setField}
              onUploadImages={uploadBodyImages}
              previewPage={previewPage}
            />
          </div>

          {!phone ? (
            details
          ) : detailsOpen ? (
            <BottomSheet
              title="Post details"
              onClose={() => setDetailsOpen(false)}
            >
              {details}
            </BottomSheet>
          ) : null}
        </div>
      )}
    </EditorFrame>
  );
}
