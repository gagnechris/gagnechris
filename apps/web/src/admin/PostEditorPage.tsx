import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { slugify } from '@gagnechris/shared';
import type { components } from '@gagnechris/api-client';
import { Button } from '../ui/Button';
import { EditorActionBar } from '../ui/EditorActionBar';
import { emptyPostDraft, parsePostTags, postDraftFromPost } from './postDraft';
import {
  PostEditorBody,
  PostEditorMeta,
  PostEditorTitle,
  type PostDraftFields,
} from './PostEditorSections';
import { ApiError, updatePost } from './query/api';
import {
  useDeletePostMutation,
  usePostLifecycleMutators,
  usePostQuery,
  useSetPostCache,
} from './query/posts';
import { uploadImages } from './uploadImages';
import { useDraftPublishEditor } from './useDraftPublishEditor';
import { useDraftUpdater } from './useDraftUpdater';
import { useQueuedAutosave } from './useQueuedAutosave';

type Post = components['schemas']['Post'];
type DraftFields = PostDraftFields;

export default function PostEditorPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const {
    data: post,
    error: queryError,
    isPending,
    isFetchedAfterMount,
  } = usePostQuery(postId);
  const setPostCache = useSetPostCache();
  const deleteMutation = useDeletePostMutation();
  const {
    publish: publishRequest,
    unpublish: unpublishRequest,
    discard: discardRequest,
  } = usePostLifecycleMutators(postId);

  const [draft, setDraft] = useState<DraftFields>(emptyPostDraft);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [slugManual, setSlugManual] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mobilePane, setMobilePane] = useState<'edit' | 'preview'>('edit');
  /** Last version adopted for edits (hydrate / clean refetch / save). Not read from query alone. */
  const [boundVersion, setBoundVersion] = useState(0);
  const versionRef = useRef(0);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const conflictMessage =
    'Conflict — another save updated this post. Reload and try again.';

  // Hydrate only from a mount fetch so stale cache cannot seed the draft (CHR-147).
  if (post && isFetchedAfterMount && post.id !== hydratedId) {
    setHydratedId(post.id);
    setDraft(postDraftFromPost(post));
    setSlugManual(true);
    setDirty(false);
    setBoundVersion(post.version);
  }

  // Clean editor + newer server: adopt content (render-time adjust).
  if (
    post &&
    hydratedId === post.id &&
    !dirty &&
    post.version > boundVersion
  ) {
    setDraft(postDraftFromPost(post));
    setBoundVersion(post.version);
  }

  useEffect(() => {
    versionRef.current = boundVersion;
  }, [boundVersion]);

  const performSave = useCallback(
    async (current: DraftFields, version: number) => {
      if (!postId) return { ok: false as const, status: 0 };
      try {
        const entity = await updatePost(postId, {
          version,
          title: current.title.trim() || 'Untitled',
          slug: current.slug.trim() || 'untitled',
          excerpt: current.excerpt,
          bodyMarkdown: current.bodyMarkdown,
          tags: parsePostTags(current.tagsText),
          coverImage: current.coverImage.trim() || null,
        });
        return { ok: true as const, entity };
      } catch (err) {
        return {
          ok: false as const,
          status: err instanceof ApiError ? err.status : 0,
        };
      }
    },
    [postId],
  );

  const getVersion = useCallback((entity: Post) => entity.version, []);
  const onSaved = useCallback(
    (entity: Post) => {
      setPostCache(entity);
      setBoundVersion(entity.version);
    },
    [setPostCache],
  );
  const onReplaceDraft = useCallback(
    (entity: Post) => {
      setPostCache(entity);
      setDraft(postDraftFromPost(entity));
      setBoundVersion(entity.version);
    },
    [setPostCache],
  );

  const autosave = useQueuedAutosave({
    draft,
    dirty,
    setDirty,
    enabled: Boolean(postId),
    versionRef,
    getVersion,
    performSave,
    onSaved,
    conflictMessage,
  });
  const { save, saveState, saveError, setSaveError, bumpEdit } = autosave;

  const remoteConflict =
    Boolean(post) &&
    hydratedId === post!.id &&
    dirty &&
    post!.version > boundVersion;
  const displayError = remoteConflict ? conflictMessage : saveError;

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

  const { busy, setBusy, runPublish, runUnpublish, runDiscard } =
    useDraftPublishEditor({
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
      unpublishConfirm: 'Unpublish this post? It will leave the public blog.',
      discardConfirm:
        'Discard unpublished edits and restore the last published post?',
      enabled: Boolean(postId),
    });

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.title, post]);

  const updateDraft = useDraftUpdater(setDraft, bumpEdit, setDirty);
  const setField = <K extends keyof DraftFields>(
    key: K,
    value: DraftFields[K],
  ) => {
    updateDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'title' && !slugManual) {
        next.slug = slugify(String(value)) || 'untitled';
      }
      return next;
    });
  };

  const handleUploadImages = useCallback(
    async (files: File[]) => {
      try {
        setSaveError(null);
        return await uploadImages(files);
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : 'Image upload failed',
        );
        return [];
      }
    },
    [setSaveError],
  );

  const runDelete = async () => {
    if (!postId || busy) return;
    if (
      !window.confirm(
        'Soft-delete this post? You can recover it later via the API.',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteMutation.mutateAsync(postId);
      setDirty(false);
      void navigate('/admin');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const loadError =
    queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? 'Could not load post.'
        : null;

  if (loadError) {
    return (
      <section className="admin-panel">
        <p className="admin-panel__error" role="alert">
          {loadError}
        </p>
        <Link to="/admin">← Back to posts</Link>
      </section>
    );
  }

  if (isPending || !isFetchedAfterMount || !post || hydratedId !== post.id) {
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
          <Link to="/admin" className="admin-back">
            ← Posts
          </Link>
        }
        status={post.status}
        hasUnpublishedChanges={post.hasUnpublishedChanges}
        saveState={saveState}
        dirty={dirty}
        busy={busy}
        viewLiveHref={post.status === 'published' ? `/blog/${post.slug}` : null}
        onPublish={() => void runPublish()}
        onUnpublish={() => void runUnpublish()}
        onDiscard={() => void runDiscard()}
        onSave={() => void save()}
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

      <PostEditorTitle
        title={draft.title}
        titleRef={titleRef}
        onChange={(value) => setField('title', value)}
      />

      {displayError ? (
        <p className="admin-panel__error" role="alert">
          {displayError}
        </p>
      ) : null}

      <PostEditorMeta
        draft={draft}
        setField={setField}
        setSlugManual={setSlugManual}
        onSave={() => void save()}
      />

      <PostEditorBody
        draft={draft}
        mobilePane={mobilePane}
        setMobilePane={setMobilePane}
        setField={setField}
        onUploadImages={handleUploadImages}
      />
    </section>
  );
}
