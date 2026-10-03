import { useCallback, useEffect, useRef, useState } from 'react';
import { useGetApiClient } from './AppApiProvider.js';
import type { ConfirmFn } from './platform.js';
import { ApiError } from './query/api.js';
import type { VersionedResource } from './query/createVersionedResource.js';
import { useQueuedAutosave, type SaveState } from './useQueuedAutosave.js';

export type VersionedDocEntity = {
  version: number;
};

export type VersionedDocDeleteOptions = {
  confirm: string;
  /** Receives the editor's current entity version (CHR-186). */
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
  /** When false, queries/mutations stay idle (e.g. missing note id). */
  enabled?: boolean;
  initialDraft: TDraft;
  toDraft: (entity: TEntity) => TDraft;
  /** Stable id so remounted cache rows re-hydrate once per entity. */
  getEntityId: (entity: TEntity) => string;
  toPayload: (draft: TDraft, entity: TEntity) => Record<string, unknown>;
  conflictMessage: string;
  /**
   * Optional 409 `error` code → message map (e.g. posts pass
   * `{ slug_taken: 'That slug is already taken…' }`).
   */
  conflictMessages?: Record<string, string>;
  confirm: ConfirmFn;
  /** Fallback when the query error is not an ApiError. */
  loadErrorFallback?: string;
  /** Soft-delete. Runs inside autosave hold. */
  delete?: VersionedDocDeleteOptions;
  /** Extra work on first hydrate (e.g. mark slug as manual). */
  onHydrate?: (entity: TEntity) => void;
};

/**
 * Platform-neutral versioned document editor: hydrate-once, version binding,
 * performSave, autosave, remote-conflict detection, and delete-with-hold.
 * No draft/publish status required — Notebook notes use this directly (CHR-173).
 * Publishable entities layer `useDraftPublishEditor` / `useVersionedEntityEditor`.
 */
export function useVersionedDocEditor<
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
}: VersionedDocEditorOptions<TEntity, TDraft, TParams>) {
  const getClient = useGetApiClient();
  const query = resource.useQuery(params, enabled);
  const setCache = resource.useSetCache();

  const [draft, setDraft] = useState<TDraft>(initialDraft);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [boundVersion, setBoundVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const versionRef = useRef(0);
  const entityRef = useRef<TEntity | null>(null);
  const busyRef = useRef(false);
  const suppressLeaveGuardRef = useRef(false);
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

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

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
          error: err instanceof ApiError ? err.error : undefined,
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
    conflictMessages,
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
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const remoteConflict =
    Boolean(entity) &&
    hydratedId === getEntityIdRef.current(entity!) &&
    dirty &&
    entity!.version > boundVersion &&
    // Ignore refetches that land while our own PUT is in flight — otherwise the
    // conflict banner flashes until onSaved bumps boundVersion (CHR-165).
    saveState !== 'saving';
  const displayError = remoteConflict ? conflictMessage : saveError;

  const withHold = useCallback(
    async (fn: () => Promise<void>) => {
      if (!enabled || busyRef.current) return;
      setAutosaveHeld(true);
      setBusy(true);
      busyRef.current = true;
      setSaveError(null);
      try {
        await fn();
      } finally {
        setAutosaveHeld(false);
        setBusy(false);
        busyRef.current = false;
      }
    },
    [enabled, setAutosaveHeld, setSaveError],
  );

  const runDelete = useCallback(async () => {
    if (!deleteOpts || !enabled || busyRef.current) return;
    if (!(await confirm(deleteOpts.confirm))) return;
    await withHold(async () => {
      // Wait out any in-flight autosave PUT first so DELETE sends the version
      // that save produced, not the one before it (CHR-165 / CHR-186).
      await awaitInFlight();
      try {
        await deleteOpts.mutate(versionRef.current);
        // Clear dirty before navigation so leave-guards do not prompt (CHR-158).
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
    markClean,
    setSaveError,
    withHold,
  ]);

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

  return {
    draft,
    setDraft,
    updateDraft,
    entity: entity ?? null,
    dirty,
    setDirty,
    busy,
    save,
    saveState: saveState as SaveState,
    saveError: displayError,
    setSaveError,
    loadError,
    isLoading,
    runDelete,
    saveRef,
    suppressLeaveGuardRef,
    bumpEdit,
    versionRef,
    /** Shared hold for publish/unpublish/discard layers (CHR-173). */
    withHold,
    isBusy: () => busyRef.current,
    onEntityMeta: onSaved,
    onReplaceDraft,
    autosave,
  };
}
