import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfirmFn } from './platform.js';
import type { FlushResult, SaveState } from './useQueuedAutosave.js';

type MutateResult<TEntity> = {
  data?: TEntity;
  error?: unknown;
  response: { status: number };
};

/** Subset of `useQueuedAutosave` return used by the publish flow. */
export type DraftPublishAutosave = {
  save: () => Promise<FlushResult>;
  setSaveState: (state: SaveState) => void;
  setSaveError: (message: string | null) => void;
  getEditGen: () => number;
  getLastSavedGen: () => number;
  /** Align lastSavedGen after Discard so Publish does not look falsely dirty. */
  markClean: () => void;
  setAutosaveHeld: (held: boolean) => void;
  /** Wait for an in-flight PUT chain (no-op when idle). */
  awaitInFlight: () => Promise<FlushResult>;
};

export type DraftPublishDeleteOptions = {
  confirm: string;
  mutate: () => Promise<void>;
  onDeleted: () => void;
};

export type DraftPublishEditorOptions<TEntity> = {
  autosave: DraftPublishAutosave;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  versionRef: { current: number };
  getVersion: (entity: TEntity) => number;
  /** Update entity metadata only — never replace the live draft. */
  onEntityMeta: (entity: TEntity) => void;
  /** Replace draft from the server entity (discard). */
  onReplaceDraft: (entity: TEntity) => void;
  publish: () => Promise<MutateResult<TEntity>>;
  unpublish: () => Promise<MutateResult<TEntity>>;
  discard: () => Promise<MutateResult<TEntity>>;
  unpublishConfirm: string;
  discardConfirm: string;
  enabled?: boolean;
  /** Injected async confirm (web wraps `window.confirm`). No DOM default. */
  confirm: ConfirmFn;
  /** Soft-delete via hold so a debounced PUT cannot race DELETE (CHR-158). */
  delete?: DraftPublishDeleteOptions;
};

/**
 * Shared Publish / Unpublish / Discard / Delete flow for versioned editors
 * (CHR-124 / CHR-132 / CHR-158): hold autosave, flush without treating pending
 * edits as clean, preserve typing during the request.
 *
 * Navigation leave-guards, beforeunload, and keyboard shortcuts stay in the
 * web (or RN) shell — this hook has no `window` / `document` usage.
 */
export function useDraftPublishEditor<TEntity>({
  autosave,
  dirty,
  setDirty,
  versionRef,
  getVersion,
  onEntityMeta,
  onReplaceDraft,
  publish,
  unpublish,
  discard,
  unpublishConfirm,
  discardConfirm,
  enabled = true,
  confirm,
  delete: deleteOpts,
}: DraftPublishEditorOptions<TEntity>) {
  const {
    save,
    setSaveState,
    setSaveError,
    getEditGen,
    getLastSavedGen,
    markClean,
    setAutosaveHeld,
    awaitInFlight,
  } = autosave;

  const [busy, setBusy] = useState(false);
  const saveRef = useRef(save);
  const publishRef = useRef<() => Promise<void>>(async () => {});
  const busyRef = useRef(false);
  /** Set true before programmatic leave after delete so leave-guards skip. */
  const suppressLeaveGuardRef = useRef(false);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const applyKeepDraft = useCallback(
    (entity: TEntity, baselineGen: number) => {
      onEntityMeta(entity);
      versionRef.current = getVersion(entity);
      if (getEditGen() === baselineGen) {
        setDirty(false);
        setSaveState('saved');
      } else {
        setDirty(true);
        setSaveState('idle');
      }
    },
    [getEditGen, getVersion, onEntityMeta, setDirty, setSaveState, versionRef],
  );

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

  const runPublish = useCallback(async () => {
    await withHold(async () => {
      if (dirty) {
        const flush = await save();
        if (flush === 'error') return;
      }
      // Baseline is what is actually on the server after the flush — not the
      // edit gen at click time (pending text typed during an in-flight save).
      const baselineGen = getLastSavedGen();
      const { data, error, response } = await publish();
      if (error || !data) {
        setSaveError(`Publish failed (${response.status}).`);
        return;
      }
      applyKeepDraft(data, baselineGen);
    });
  }, [
    applyKeepDraft,
    dirty,
    getLastSavedGen,
    publish,
    save,
    setSaveError,
    withHold,
  ]);

  useEffect(() => {
    publishRef.current = runPublish;
  });

  const runUnpublish = useCallback(async () => {
    if (!enabled || busyRef.current) return;
    if (!(await confirm(unpublishConfirm))) return;
    await withHold(async () => {
      if (dirty) {
        const flush = await save();
        if (flush === 'error') return;
      }
      const baselineGen = getLastSavedGen();
      const { data, error, response } = await unpublish();
      if (error || !data) {
        setSaveError(`Unpublish failed (${response.status}).`);
        return;
      }
      applyKeepDraft(data, baselineGen);
    });
  }, [
    applyKeepDraft,
    confirm,
    dirty,
    enabled,
    getLastSavedGen,
    save,
    setSaveError,
    unpublish,
    unpublishConfirm,
    withHold,
  ]);

  const runDiscard = useCallback(async () => {
    if (!enabled || busyRef.current) return;
    if (!(await confirm(discardConfirm))) return;
    await withHold(async () => {
      const { data, error, response } = await discard();
      if (error || !data) {
        setSaveError(`Discard failed (${response.status}).`);
        return;
      }
      onReplaceDraft(data);
      versionRef.current = getVersion(data);
      markClean();
    });
  }, [
    confirm,
    discard,
    discardConfirm,
    enabled,
    getVersion,
    markClean,
    onReplaceDraft,
    setSaveError,
    versionRef,
    withHold,
  ]);

  const runDelete = useCallback(async () => {
    if (!deleteOpts || !enabled || busyRef.current) return;
    if (!(await confirm(deleteOpts.confirm))) return;
    await withHold(async () => {
      // DELETE carries no version — wait out any in-flight autosave PUT first
      // so the two cannot race (CHR-165).
      await awaitInFlight();
      try {
        await deleteOpts.mutate();
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

  return {
    busy,
    runPublish,
    runUnpublish,
    runDiscard,
    runDelete,
    /** Exposed so the host can wire ⌘S / ⌘⏎ without DOM inside this package. */
    saveRef,
    publishRef,
    /** True while publish/unpublish/discard/delete hold is active. */
    isBusy: () => busyRef.current,
    /** Host leave-guards should skip when this is true (post-delete navigate). */
    suppressLeaveGuardRef,
  };
}
