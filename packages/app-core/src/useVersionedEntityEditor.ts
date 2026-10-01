import { useCallback, useEffect, useRef, useState } from 'react';
import { useGetApiClient } from './AppApiProvider.js';
import type { ConfirmFn } from './platform.js';
import { ApiError } from './query/api.js';
import type { DraftPublishResource } from './query/createDraftPublishResource.js';
import {
  useDraftPublishEditor,
  type DraftPublishDeleteOptions,
} from './useDraftPublishEditor.js';
import { useQueuedAutosave, type SaveState } from './useQueuedAutosave.js';

export type VersionedEditorEntity = {
  version: number;
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
 * Platform-neutral versioned draft editor: hydrate-once, version binding,
 * performSave, autosave, publish/unpublish/discard/delete with hold (CHR-158).
 * Web/RN shells add confirm, leave guards, and shortcuts around this hook.
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
  confirm,
  unpublishConfirm,
  discardConfirm,
  loadErrorFallback = 'Could not load content.',
  delete: deleteOpts,
  onHydrate,
}: VersionedEntityEditorOptions<TEntity, TDraft, TParams>) {
  const getClient = useGetApiClient();
  const query = resource.useQuery(params, enabled);
  const setCache = resource.useSetCache();
  const {
    publish: publishRequest,
    unpublish: unpublishRequest,
    discard: discardRequest,
  } = resource.useLifecycleMutators(params);

  const [draft, setDraft] = useState<TDraft>(initialDraft);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [boundVersion, setBoundVersion] = useState(0);
  const versionRef = useRef(0);
  const entityRef = useRef<TEntity | null>(null);
  const onHydrateRef = useRef(onHydrate);
  const toDraftRef = useRef(toDraft);
  const getEntityIdRef = useRef(getEntityId);

  useEffect(() => {
    onHydrateRef.current = onHydrate;
  }, [onHydrate]);
  useEffect(() => {
    toDraftRef.current = toDraft;
  }, [toDraft]);
  useEffect(() => {
    getEntityIdRef.current = getEntityId;
  }, [getEntityId]);

  const entity = query.data;
  const { error: queryError, isPending, isFetchedAfterMount } = query;

  if (
    entity &&
    isFetchedAfterMount &&
    getEntityIdRef.current(entity) !== hydratedId
  ) {
    setHydratedId(getEntityIdRef.current(entity));
    setDraft(toDraftRef.current(entity));
    setDirty(false);
    setBoundVersion(entity.version);
    onHydrateRef.current?.(entity);
  }

  if (
    entity &&
    hydratedId === getEntityIdRef.current(entity) &&
    !dirty &&
    entity.version > boundVersion
  ) {
    setDraft(toDraftRef.current(entity));
    setBoundVersion(entity.version);
  }

  useEffect(() => {
    entityRef.current = entity ?? null;
  }, [entity]);

  useEffect(() => {
    versionRef.current = boundVersion;
  }, [boundVersion]);

  const getVersion = useCallback((e: TEntity) => e.version, []);

  const performSave = useCallback(
    async (current: TDraft, version: number) => {
      if (!enabled) return { ok: false as const, status: 0 };
      try {
        const currentEntity = entityRef.current;
        if (!currentEntity) return { ok: false as const, status: 0 };
        const entitySaved = await resource.update(getClient(), params, {
          version,
          ...toPayload(current, currentEntity),
        });
        return { ok: true as const, entity: entitySaved };
      } catch (err) {
        return {
          ok: false as const,
          status: err instanceof ApiError ? err.status : 0,
        };
      }
    },
    [enabled, getClient, params, resource, toPayload],
  );

  const onSaved = useCallback(
    (saved: TEntity) => {
      setCache(saved);
      setBoundVersion(saved.version);
    },
    [setCache],
  );

  const onReplaceDraft = useCallback(
    (saved: TEntity) => {
      setCache(saved);
      setDraft(toDraftRef.current(saved));
      setBoundVersion(saved.version);
    },
    [setCache],
  );

  const autosave = useQueuedAutosave({
    draft,
    dirty,
    setDirty,
    enabled,
    versionRef,
    getVersion,
    performSave,
    onSaved,
    conflictMessage,
  });

  const { save, saveState, saveError, setSaveError, bumpEdit } = autosave;

  const remoteConflict =
    Boolean(entity) &&
    hydratedId === getEntityIdRef.current(entity!) &&
    dirty &&
    entity!.version > boundVersion;
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

  const {
    busy,
    runPublish,
    runUnpublish,
    runDiscard,
    runDelete,
    saveRef,
    publishRef,
    suppressLeaveGuardRef,
  } = useDraftPublishEditor({
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
    unpublishConfirm,
    discardConfirm,
    enabled,
    confirm,
    delete: deleteOpts,
  });

  const updateDraft = useCallback(
    (update: (prev: TDraft) => TDraft) => {
      setDraft(update);
      bumpEdit();
      setDirty(true);
    },
    [bumpEdit],
  );

  const loadError =
    queryError instanceof ApiError
      ? queryError.message
      : queryError
        ? loadErrorFallback
        : null;

  const isLoading =
    Boolean(enabled) &&
    (isPending ||
      !isFetchedAfterMount ||
      !entity ||
      hydratedId !== getEntityIdRef.current(entity));

  const actionBarProps: VersionedEntityActionBarProps = {
    status: entity?.status ?? 'draft',
    hasUnpublishedChanges: entity?.hasUnpublishedChanges ?? false,
    saveState,
    dirty,
    busy,
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
      void save();
    },
  };

  return {
    draft,
    setDraft,
    updateDraft,
    entity: entity ?? null,
    dirty,
    setDirty,
    busy,
    save,
    saveState,
    saveError: displayError,
    setSaveError,
    loadError,
    isLoading,
    actionBarProps,
    runPublish,
    runUnpublish,
    runDiscard,
    runDelete,
    saveRef,
    publishRef,
    suppressLeaveGuardRef,
    bumpEdit,
    versionRef,
  };
}
