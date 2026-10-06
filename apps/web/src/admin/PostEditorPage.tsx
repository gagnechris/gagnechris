import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EMPTY_SLUG_FALLBACK, slugify } from '@gagnechris/shared';
import {
  mergeEditorSeo,
  postResource,
  useDeletePostMutation,
  useGetApiClient,
  useProjectsQuery,
} from '@gagnechris/app-core';
import { Button } from '../kit/Button';
import { EditorActionBar } from '../workspace/ui/EditorActionBar';
import { emptyPostDraft, parsePostTags, postDraftFromPost } from './postDraft';
import {
  PostEditorBody,
  PostEditorDetails,
  PostEditorTitle,
  type PostDraftFields,
} from './PostEditorSections';
import { uploadImages } from './uploadImages';
import { publicUrl } from './publicUrl';
import { isPlaceholderSlug } from './placeholderSlug';
import { useVersionedEntityEditor } from '../workspace/useVersionedEntityEditor';

/** Outer shell keys the editor by postId so A→B navigation drops pending debounce. */
export default function PostEditorPage() {
  const { postId } = useParams<{ postId: string }>();
  if (!postId) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          Missing post id.
        </p>
        <Link to="/">← Back to posts</Link>
      </section>
    );
  }
  return <PostEditorPageInner key={postId} postId={postId} />;
}

function PostEditorPageInner({ postId }: { postId: string }) {
  const navigate = useNavigate();
  const getClient = useGetApiClient();
  const deleteMutation = useDeletePostMutation();
  const projectsQuery = useProjectsQuery();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [slugManual, setSlugManual] = useState(false);

  const {
    draft,
    updateDraft,
    entity: post,
    busy,
    save,
    saveError,
    setSaveError,
    loadError,
    isLoading,
    actionBarProps,
    runDelete,
  } = useVersionedEntityEditor({
    resource: postResource,
    params: { id: postId },
    enabled: true,
    initialDraft: emptyPostDraft(),
    toDraft: postDraftFromPost,
    getEntityId: (entity) => entity.id,
    toPayload: (current, entity) => ({
      title: current.title.trim() || 'Untitled',
      slug: current.slug.trim() || EMPTY_SLUG_FALLBACK,
      excerpt: current.excerpt,
      bodyMarkdown: current.bodyMarkdown,
      tags: parsePostTags(current.tagsText),
      projectIds: current.projectIds,
      coverImage: current.coverImage.trim() || null,
      seo: mergeEditorSeo(entity.seo, current),
    }),
    conflictMessage:
      'Conflict — another save updated this post. Reload and try again.',
    slugTakenMessage: 'That slug is already taken. Choose a different slug.',
    loadErrorFallback: 'Could not load post.',
    unpublishConfirm:
      'Unpublish this post? It will leave the public Posts page.',
    discardConfirm:
      'Discard unpublished edits and restore the last published post?',
    onHydrate: (entity) => setSlugManual(!isPlaceholderSlug(entity.slug)),
    delete: {
      confirm: 'Soft-delete this post? You can recover it later via the API.',
      mutate: async (version) => {
        await deleteMutation.mutateAsync({ id: postId, version });
      },
      onDeleted: () => {
        void navigate('/');
      },
    },
  });

  const setField = <K extends keyof PostDraftFields>(
    key: K,
    value: PostDraftFields[K],
  ) => {
    updateDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'title' && !slugManual) {
        next.slug = slugify(String(value)) || EMPTY_SLUG_FALLBACK;
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
        <Link to="/">← Back to posts</Link>
      </section>
    );
  }

  if (isLoading || !post) {
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
          <Link to="/" className="admin-back">
            ← Posts
          </Link>
        }
        {...actionBarProps}
        viewLiveHref={
          post.status === 'published' ? publicUrl(`/posts/${post.slug}`) : null
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

      <div className="admin-post-editor">
        <div className="admin-post-editor__main">
          <PostEditorTitle
            title={draft.title}
            titleRef={titleRef}
            onChange={(value) => setField('title', value)}
          />

          {saveError ? (
            <p className="admin-panel__error" role="alert">
              {saveError}
            </p>
          ) : null}

          <PostEditorBody
            draft={draft}
            setField={setField}
            onUploadImages={handleUploadImages}
          />
        </div>

        <PostEditorDetails
          draft={draft}
          setField={setField}
          setSlugManual={setSlugManual}
          onSave={() => void save()}
          onUploadImages={handleUploadImages}
          projects={projectsQuery.data}
          projectsError={
            projectsQuery.error ? 'Could not load projects.' : null
          }
        />
      </div>
    </section>
  );
}
