import { useCallback } from 'react';
import type { ConfirmFn } from './platform.js';
import type { MutateResult } from './query/api.js';
import type { FlushResult, SaveState } from './useQueuedAutosave.js';

export type DraftPublishAutosave = {
  save: () => Promise<FlushResult>;
  setSaveState: (state: SaveState) => void;
  setSaveError: (message: string | null) => void;
  getEditGen: () => number;
  getLastSavedGen: () => number;
  markClean: () => void;
  awaitInFlight: () => Promise<FlushResult>;
};

export type DraftPublishHold = {
  withHold: (fn: () => Promise<void>) => Promise<void>;
  isBusy: () => boolean;
};

export type DraftPublishDoc<TEntity> = {
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  /** Binds the entity's version and metadata; never replaces the live draft. */
  onEntityMeta: (entity: TEntity) => void;
  /** Replaces the draft and bound version with the entity's. */
  onReplaceDraft: (entity: TEntity) => void;
};

export type DraftPublishRequests<TEntity> = {
  publish: () => Promise<MutateResult<TEntity>>;
  unpublish: () => Promise<MutateResult<TEntity>>;
  discard: () => Promise<MutateResult<TEntity>>;
};

export type DraftPublishEditorOptions<TEntity> = {
  autosave: DraftPublishAutosave;
  doc: DraftPublishDoc<TEntity>;
  /** Shared with `useVersionedDocEditor` so publish and delete cannot race. */
  hold: DraftPublishHold;
  requests: DraftPublishRequests<TEntity>;
  confirm: ConfirmFn;
  confirmMessages: { unpublish: string; discard: string };
  enabled?: boolean;
  /**
   * Runs when Publish is triggered and nothing holds the editor, before
   * pending edits are flushed; `false` or a message (shown as the save error)
   * cancels. Save, Unpublish and Discard do not consult it.
   */
  beforePublish?: () => boolean | string;
};

/** Leave-guards and keyboard shortcuts stay in the shell; this hook has no DOM usage. */
export function useDraftPublishEditor<TEntity>({
  autosave,
  doc,
  hold,
  requests,
  confirm,
  confirmMessages,
  enabled = true,
  beforePublish,
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
  const { dirty, setDirty, onEntityMeta, onReplaceDraft } = doc;
  const { withHold, isBusy } = hold;
  const { publish, unpublish, discard } = requests;
  const { unpublish: unpublishConfirm, discard: discardConfirm } =
    confirmMessages;

  // Under hold, joining an in-flight save ends that chain at 'pending' with
  // later edits unsent, so keep saving until every edit made before the click
  // is on the server.
  const flushEdits = useCallback(async (): Promise<boolean> => {
    const target = getEditGen();
    if (!dirty && getLastSavedGen() >= target) return true;
    for (;;) {
      if ((await save()) === 'error') return false;
      if (getLastSavedGen() >= target) return true;
    }
  }, [dirty, getEditGen, getLastSavedGen, save]);

  /** Publish and Unpublish keep the draft; only version and status change. */
  const flushThen = useCallback(
    async (
      request: () => Promise<MutateResult<TEntity>>,
      label: string,
    ): Promise<void> => {
      if (!(await flushEdits())) return;
      // Baseline is what is on the server after the flush, not the edit gen at
      // click time (text may be typed while the flush runs).
      const baselineGen = getLastSavedGen();
      const { data, error, response } = await request();
      if (error || !data) {
        setSaveError(`${label} failed (${response.status}).`);
        return;
      }
      onEntityMeta(data);
      if (getEditGen() === baselineGen) {
        setDirty(false);
        setSaveState('saved');
      } else {
        setDirty(true);
        setSaveState('idle');
      }
    },
    [
      flushEdits,
      getEditGen,
      getLastSavedGen,
      onEntityMeta,
      setDirty,
      setSaveError,
      setSaveState,
    ],
  );

  const runPublish = useCallback(async () => {
    if (!enabled || isBusy()) return;
    const verdict = beforePublish?.() ?? true;
    if (verdict !== true) {
      if (typeof verdict === 'string') setSaveError(verdict);
      return;
    }
    await withHold(() => flushThen(publish, 'Publish'));
  }, [
    beforePublish,
    enabled,
    flushThen,
    isBusy,
    publish,
    setSaveError,
    withHold,
  ]);

  const runUnpublish = useCallback(async () => {
    if (!enabled || isBusy()) return;
    if (!(await confirm(unpublishConfirm))) return;
    await withHold(() => flushThen(unpublish, 'Unpublish'));
  }, [
    confirm,
    enabled,
    flushThen,
    isBusy,
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
      markClean();
    });
  }, [
    awaitInFlight,
    confirm,
    discard,
    discardConfirm,
    enabled,
    isBusy,
    markClean,
    onReplaceDraft,
    setSaveError,
    withHold,
  ]);

  return { runPublish, runUnpublish, runDiscard };
}
