import { deepEqual } from '@gagnechris/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useGetApiClient } from './AppApiProvider.js';
import { useEditorStore } from './editorStore.js';
import { peekPendingFlush, takePendingFlush } from './pendingFlushes.js';
import type { ConfirmFn, RetrySignals } from './platform.js';
import { ApiError, errorMessage } from './query/api.js';
import type { VersionedResource } from './query/createVersionedResource.js';
import type {
  DraftPublishAutosave,
  DraftPublishDoc,
  DraftPublishHold,
} from './useDraftPublishEditor.js';
import { useLatest } from './useLatest.js';
import { useQueuedAutosave } from './useQueuedAutosave.js';

export type VersionedDocEntity = {
  version: number;
};

// The API stores a cleared field (null) by omitting it.
const holdsSentFields = (sent: Record<string, unknown>, current: object) =>
  Object.entries(sent).every(
    ([key, value]) =>
      value === undefined ||
      deepEqual(
        value ?? null,
        (current as Record<string, unknown>)[key] ?? null,
      ),
  );

export type VersionedDocDeleteOptions = {
  confirm: string;
  mutate: (version: number) => Promise<void>;
  onDeleted: () => void;
};

export type VersionedDocEditorOptions<
  TEntity extends VersionedDocEntity,
  TDraft,
  TParams,
> = {
  resource: VersionedResource<TEntity, TParams>;
  params: TParams;
  enabled?: boolean;
  initialDraft: TDraft;
  toDraft: (entity: TEntity) => TDraft;
  /** Lets remounted cache rows re-hydrate once per entity. */
  getEntityId: (entity: TEntity) => string;
  toPayload: (draft: TDraft, entity: TEntity) => Record<string, unknown>;
  conflictMessage: string;
  conflictMessages?: Record<string, string>;
  confirm: ConfirmFn;
  loadErrorFallback?: string;
  delete?: VersionedDocDeleteOptions;
  onHydrate?: (entity: TEntity) => void;
  retrySignals?: RetrySignals;
};

/** What `useVersionedEntityEditor` layers publish, unpublish and discard on. */
export type VersionedDocController<TEntity> = {
  autosave: DraftPublishAutosave;
  doc: DraftPublishDoc<TEntity>;
  hold: DraftPublishHold;
  getBoundVersion: () => number;
};

export function useVersionedDocController<
  TEntity extends VersionedDocEntity,
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
  conflictMessages,
  confirm,
  loadErrorFallback = 'Could not load content.',
  delete: deleteOpts,
  onHydrate,
  retrySignals,
}: VersionedDocEditorOptions<TEntity, TDraft, TParams>) {
  const getClient = useGetApiClient();
  const query = resource.useQuery(params, enabled);
  const setCache = resource.useSetCache();
  const queueKey = JSON.stringify(resource.queryKey(params));

  // A previous mount of this document may still be saving (or failing to
  // save) its last edits; hydrating before that settles shows stale text
  // and binds a version that is about to be superseded.
  const { state, getState, dispatch } = useEditorStore<TDraft>(() => ({
    phase: peekPendingFlush(queueKey) ? 'adopting' : 'hydrating',
    hydratedId: null,
    adopted: null,
    draft: initialDraft,
    boundVersion: 0,
    dirty: false,
    busy: false,
  }));
  const { phase, hydratedId, draft, boundVersion, dirty, busy } = state;

  const suppressLeaveGuardRef = useRef(false);
  const onHydrateRef = useLatest(onHydrate);
  const toDraftRef = useLatest(toDraft);
  const getEntityIdRef = useLatest(getEntityId);

  useEffect(() => {
    if (!peekPendingFlush(queueKey)) return;
    let cancelled = false;
    dispatch({ type: 'adoptStart' });
    void takePendingFlush(queueKey).then((taken) => {
      if (cancelled) return;
      dispatch({
        type: 'adoptDone',
        adopted:
          taken && taken.outcome !== 'clean'
            ? { draft: taken.draft as TDraft, version: taken.version }
            : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, queueKey]);

  const entity = query.data;
  const { error: queryError, isPending, isFetchedAfterMount } = query;
  const entityId = entity ? getEntityIdRef.current(entity) : null;

  if (
    entity &&
    isFetchedAfterMount &&
    phase !== 'adopting' &&
    entityId !== hydratedId
  ) {
    const { adopted } = state;
    dispatch({
      type: 'hydrate',
      id: entityId!,
      ...(adopted
        ? { draft: adopted.draft, version: adopted.version, dirty: true }
        : {
            draft: toDraftRef.current(entity),
            version: entity.version,
            dirty: false,
          }),
    });
    onHydrateRef.current?.(entity);
  }

  if (
    entity &&
    hydratedId === entityId &&
    !dirty &&
    entity.version > boundVersion
  ) {
    dispatch({
      type: 'replace',
      draft: toDraftRef.current(entity),
      version: entity.version,
    });
  }

  const entityRef = useLatest(entity ?? null);

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
        if (!(err instanceof ApiError))
          return { ok: false as const, status: 0 };
        const current =
          err.current && typeof err.current === 'object'
            ? (err.current as TEntity)
            : undefined;
        return {
          ok: false as const,
          status: err.status,
          error: err.error,
          current,
        };
      }
    },
    [enabled, entityRef, getClient, params, resource, toPayload],
  );

  const isSavedIn = useCallback(
    (current: TDraft, stored: TEntity) =>
      holdsSentFields(toPayload(current, entityRef.current ?? stored), stored),
    [entityRef, toPayload],
  );

  const getBoundVersion = useCallback(
    () => getState().boundVersion,
    [getState],
  );

  const setDirty = useCallback(
    (next: boolean) => dispatch({ type: 'dirty', dirty: next }),
    [dispatch],
  );

  const onSaved = useCallback(
    (saved: TEntity) => {
      setCache(saved);
      dispatch({ type: 'bind', version: saved.version });
    },
    [dispatch, setCache],
  );

  const onReplaceDraft = useCallback(
    (saved: TEntity) => {
      setCache(saved);
      dispatch({
        type: 'replace',
        draft: toDraftRef.current(saved),
        version: saved.version,
      });
    },
    [dispatch, setCache, toDraftRef],
  );

  const autosave = useQueuedAutosave({
    draft,
    dirty,
    setDirty,
    enabled,
    getBaseVersion: getBoundVersion,
    performSave,
    onSaved,
    isSavedIn,
    conflictMessage,
    conflictMessages,
    tooLargeMessage: resource.tooLargeMessage,
    retrySignals,
    queueKey,
  });

  const {
    save,
    saveState,
    saveError,
    setSaveError,
    bumpEdit,
    setAutosaveHeld,
    awaitInFlight,
    markClean,
  } = autosave;

  const remoteConflict =
    Boolean(entity) &&
    hydratedId === entityId &&
    dirty &&
    entity!.version > boundVersion &&
    // Ignore refetches that land while our own PUT is in flight; otherwise the
    // conflict banner flashes until onSaved bumps boundVersion.
    saveState !== 'saving';
  const displayError = remoteConflict ? conflictMessage : saveError;

  const isBusy = useCallback(() => getState().busy, [getState]);

  const withHold = useCallback(
    async (fn: () => Promise<void>) => {
      if (!enabled || isBusy()) return;
      setAutosaveHeld(true);
      dispatch({ type: 'busy', busy: true });
      setSaveError(null);
      try {
        await fn();
      } finally {
        setAutosaveHeld(false);
        dispatch({ type: 'busy', busy: false });
      }
    },
    [dispatch, enabled, isBusy, setAutosaveHeld, setSaveError],
  );

  const runDelete = useCallback(async () => {
    if (!deleteOpts || !enabled || isBusy()) return;
    if (!(await confirm(deleteOpts.confirm))) return;
    await withHold(async () => {
      // Wait out any in-flight autosave PUT so DELETE sends the version that save
      // produced, not the one before it.
      await awaitInFlight();
      try {
        await deleteOpts.mutate(getBoundVersion());
        // Clear dirty before navigation so leave-guards do not prompt.
        markClean();
        suppressLeaveGuardRef.current = true;
        deleteOpts.onDeleted();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Delete failed.');
      }
    });
  }, [
    awaitInFlight,
    confirm,
    deleteOpts,
    enabled,
    getBoundVersion,
    isBusy,
    markClean,
    setSaveError,
    withHold,
  ]);

  const updateDraft = useCallback(
    (update: (prev: TDraft) => TDraft) => {
      dispatch({ type: 'edit', update });
      bumpEdit();
    },
    [bumpEdit, dispatch],
  );

  const loadError = queryError
    ? errorMessage(queryError, loadErrorFallback)
    : null;

  const isLoading =
    Boolean(enabled) &&
    (isPending ||
      !isFetchedAfterMount ||
      !entity ||
      phase !== 'editing' ||
      hydratedId !== entityId);

  const editor = {
    draft,
    updateDraft,
    entity: entity ?? null,
    dirty,
    busy,
    boundVersion,
    save,
    saveState,
    saveError: displayError,
    setSaveError,
    loadError,
    isLoading,
    runDelete,
    suppressLeaveGuardRef,
    /** Shows `entity` as the clean, saved state (it is also cached). */
    replaceFromEntity: onReplaceDraft,
  };

  const controller: VersionedDocController<TEntity> = {
    autosave,
    doc: { dirty, setDirty, onEntityMeta: onSaved, onReplaceDraft },
    hold: { withHold, isBusy },
    getBoundVersion,
  };

  return { editor, controller };
}

export function useVersionedDocEditor<
  TEntity extends VersionedDocEntity,
  TDraft,
  TParams,
>(options: VersionedDocEditorOptions<TEntity, TDraft, TParams>) {
  return useVersionedDocController(options).editor;
}
