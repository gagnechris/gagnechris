import { useCallback, useEffect, useRef } from 'react';
import type { ConfirmFn } from './platform.js';
import type { FlushResult, SaveState } from './useQueuedAutosave.js';

type MutateResult<TEntity> = {
  data?: TEntity;
  error?: unknown;
  response: { status: number };
};

export type DraftPublishAutosave = {
  save: () => Promise<FlushResult>;
  setSaveState: (state: SaveState) => void;
  setSaveError: (message: string | null) => void;
  getEditGen: () => number;
  getLastSavedGen: () => number;
  markClean: () => void;
  setAutosaveHeld: (held: boolean) => void;
  awaitInFlight: () => Promise<FlushResult>;
};

/** @deprecated Prefer `VersionedDocDeleteOptions` from `useVersionedDocEditor`. */
export type DraftPublishDeleteOptions = {
  confirm: string;
  mutate: (version: number) => Promise<void>;
  onDeleted: () => void;
};

export type DraftPublishHold = {
  withHold: (fn: () => Promise<void>) => Promise<void>;
  isBusy: () => boolean;
};

export type DraftPublishEditorOptions<TEntity> = {
  autosave: DraftPublishAutosave;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  versionRef: { current: number };
  getVersion: (entity: TEntity) => number;
  /** Never replace the live draft here. */
  onEntityMeta: (entity: TEntity) => void;
  onReplaceDraft: (entity: TEntity) => void;
  publish: () => Promise<MutateResult<TEntity>>;
  unpublish: () => Promise<MutateResult<TEntity>>;
  discard: () => Promise<MutateResult<TEntity>>;
  unpublishConfirm: string;
  discardConfirm: string;
  enabled?: boolean;
  confirm: ConfirmFn;
  /** Shared with `useVersionedDocEditor` so publish and delete cannot race. */
  hold: DraftPublishHold;
};

/** Leave-guards and keyboard shortcuts stay in the shell; this hook has no DOM usage. */
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
  hold,
}: DraftPublishEditorOptions<TEntity>) {
  const {
    save,
    setSaveState,
    setSaveError,
    getEditGen,
    getLastSavedGen,
    markClean,
    awaitInFlight,
  } = autosave;
  const { withHold, isBusy } = hold;

  const saveRef = useRef(save);
  const publishRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

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

  const runPublish = useCallback(async () => {
    await withHold(async () => {
      if (dirty) {
        const flush = await save();
        if (flush === 'error') return;
      }
      // Baseline is what is on the server after the flush, not the edit gen at
      // click time (text may have been typed during an in-flight save).
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
    if (!enabled || isBusy()) return;
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
    isBusy,
    save,
    setSaveError,
    unpublish,
    unpublishConfirm,
    withHold,
  ]);

  const runDiscard = useCallback(async () => {
    if (!enabled || isBusy()) return;
    if (!(await confirm(discardConfirm))) return;
    await withHold(async () => {
      // Wait out any in-flight autosave PUT so Discard does not race into a 409.
      await awaitInFlight();
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
    awaitInFlight,
    confirm,
    discard,
    discardConfirm,
    enabled,
    getVersion,
    isBusy,
    markClean,
    onReplaceDraft,
    setSaveError,
    versionRef,
    withHold,
  ]);

  return {
    runPublish,
    runUnpublish,
    runDiscard,
    saveRef,
    publishRef,
  };
}
