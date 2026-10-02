import { useCallback } from 'react';
import type { ConfirmFn } from './platform.js';
import type { DraftPublishResource } from './query/createDraftPublishResource.js';
import {
  useDraftPublishEditor,
  type DraftPublishDeleteOptions,
} from './useDraftPublishEditor.js';
import type { SaveState } from './useQueuedAutosave.js';
import {
  useVersionedDocEditor,
  type VersionedDocEntity,
} from './useVersionedDocEditor.js';

export type VersionedEditorEntity = VersionedDocEntity & {
  status: 'draft' | 'published' | 'deleted';
  hasUnpublishedChanges: boolean;
};

export type VersionedEntityEditorOptions<
  TEntity extends VersionedEditorEntity,
  TDraft,
  TParams,
> = {
  resource: DraftPublishResource<TEntity, TParams>;
  params: TParams;
  /** When false, queries/mutations stay idle (e.g. missing post id). */
  enabled?: boolean;
  initialDraft: TDraft;
  toDraft: (entity: TEntity) => TDraft;
  /** Stable id so remounted cache rows re-hydrate once per entity. */
  getEntityId: (entity: TEntity) => string;
  toPayload: (draft: TDraft, entity: TEntity) => Record<string, unknown>;
  conflictMessage: string;
  /** Shown on 409 `slug_taken` (posts). */
  slugTakenMessage?: string;
  confirm: ConfirmFn;
  unpublishConfirm: string;
  discardConfirm: string;
  /** Fallback when the query error is not an ApiError. */
  loadErrorFallback?: string;
  /** Optional soft-delete (posts). Runs inside autosave hold. */
  delete?: DraftPublishDeleteOptions;
  /** Extra work on first hydrate (e.g. mark slug as manual). */
  onHydrate?: (entity: TEntity) => void;
};

export type VersionedEntityActionBarProps = {
  status: VersionedEditorEntity['status'];
  hasUnpublishedChanges: boolean;
  saveState: SaveState;
  dirty: boolean;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onDiscard: () => void;
  onSave: () => void;
};

/**
 * Draft/publish versioned editor for post / home / resume: layers publish
 * lifecycle on `useVersionedDocEditor` (CHR-158 / CHR-173). Non-publishable
 * entities should call `useVersionedDocEditor` directly.
 */
export function useVersionedEntityEditor<
  TEntity extends VersionedEditorEntity,
  TDraft,
  TParams,
>({
  resource,
  params,
  enabled = true,
  initialDraft,
  toDraft,
  getEntityId,
  toPayload,
  conflictMessage,
  slugTakenMessage,
  confirm,
  unpublishConfirm,
  discardConfirm,
  loadErrorFallback = 'Could not load content.',
  delete: deleteOpts,
  onHydrate,
}: VersionedEntityEditorOptions<TEntity, TDraft, TParams>) {
  const {
    publish: publishRequest,
    unpublish: unpublishRequest,
    discard: discardRequest,
  } = resource.useLifecycleMutators(params);

  const doc = useVersionedDocEditor({
    resource,
    params,
    enabled,
    initialDraft,
    toDraft,
    getEntityId,
    toPayload,
    conflictMessage,
    conflictMessages: slugTakenMessage
      ? { slug_taken: slugTakenMessage }
      : undefined,
    confirm,
    loadErrorFallback,
    delete: deleteOpts,
    onHydrate,
  });

  const publishMutate = useCallback(
    () => publishRequest({ version: doc.versionRef.current }),
    [publishRequest, doc.versionRef],
  );
  const unpublishMutate = useCallback(
    () => unpublishRequest({ version: doc.versionRef.current }),
    [unpublishRequest, doc.versionRef],
  );
  const discardMutate = useCallback(
    () => discardRequest({ version: doc.versionRef.current }),
    [discardRequest, doc.versionRef],
  );

  const getVersion = useCallback((e: TEntity) => e.version, []);

  const { runPublish, runUnpublish, runDiscard, publishRef } =
    useDraftPublishEditor({
      autosave: doc.autosave,
      dirty: doc.dirty,
      setDirty: doc.setDirty,
      versionRef: doc.versionRef,
      getVersion,
      onEntityMeta: doc.onEntityMeta,
      onReplaceDraft: doc.onReplaceDraft,
      publish: publishMutate,
      unpublish: unpublishMutate,
      discard: discardMutate,
      unpublishConfirm,
      discardConfirm,
      enabled,
      confirm,
      hold: { withHold: doc.withHold, isBusy: doc.isBusy },
    });

  const actionBarProps: VersionedEntityActionBarProps = {
    status: doc.entity?.status ?? 'draft',
    hasUnpublishedChanges: doc.entity?.hasUnpublishedChanges ?? false,
    saveState: doc.saveState,
    dirty: doc.dirty,
    busy: doc.busy,
    onPublish: () => {
      void runPublish();
    },
    onUnpublish: () => {
      void runUnpublish();
    },
    onDiscard: () => {
      void runDiscard();
    },
    onSave: () => {
      void doc.save();
    },
  };

  return {
    draft: doc.draft,
    setDraft: doc.setDraft,
    updateDraft: doc.updateDraft,
    entity: doc.entity,
    dirty: doc.dirty,
    setDirty: doc.setDirty,
    busy: doc.busy,
    save: doc.save,
    saveState: doc.saveState,
    saveError: doc.saveError,
    setSaveError: doc.setSaveError,
    loadError: doc.loadError,
    isLoading: doc.isLoading,
    actionBarProps,
    runPublish,
    runUnpublish,
    runDiscard,
    runDelete: doc.runDelete,
    saveRef: doc.saveRef,
    publishRef,
    suppressLeaveGuardRef: doc.suppressLeaveGuardRef,
    bumpEdit: doc.bumpEdit,
    versionRef: doc.versionRef,
  };
}
