import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultTimers, type Timers } from './platform.js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type AutosaveResult<TEntity> =
  { ok: true; entity: TEntity } | { ok: false; status: number };

/** Outcome of an explicit `save()` flush (CHR-124). */
export type FlushResult = 'clean' | 'pending' | 'error';

type Options<TDraft, TEntity> = {
  /** Latest draft; also used as the debounce dependency. */
  draft: TDraft | null | undefined;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  enabled?: boolean;
  debounceMs?: number;
  versionRef: { current: number };
  getVersion: (entity: TEntity) => number;
  performSave: (
    draft: TDraft,
    version: number,
  ) => Promise<AutosaveResult<TEntity>>;
  /** Update entity metadata (version, updatedAt, status, seo). Do not replace the draft here. */
  onSaved: (entity: TEntity) => void;
  conflictMessage: string;
  /** Defaults to `globalThis` timers (no `window`). */
  timers?: Timers;
};

/**
 * Single-flight autosave with a latest-draft queue.
 * After a successful save, callers must not clobber the live draft with a
 * normalized server response — only update version / metadata via `onSaved`.
 * Dirty clears only when nothing was typed since the request that just finished.
 *
 * Call `setAutosaveHeld(true)` while Publish/Unpublish/Discard is in flight so
 * debounced autosaves do not race the version bump (CHR-121). Explicit `save()`
 * still runs (flush-before-publish). When hold stops the loop with unsaved
 * edits, `save()` returns `'pending'` and `getLastSavedGen()` reflects only
 * what was actually persisted (CHR-124).
 */
export function useQueuedAutosave<TDraft, TEntity>({
  draft,
  dirty,
  setDirty,
  enabled = true,
  debounceMs = 900,
  versionRef,
  getVersion,
  performSave,
  onSaved,
  conflictMessage,
  timers = defaultTimers,
}: Options<TDraft, TEntity>) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Re-render token so debounce effect cancels when hold flips. */
  const [held, setHeld] = useState(false);

  const draftRef = useRef(draft);
  const editGenRef = useRef(0);
  const lastSavedGenRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const chainRef = useRef<Promise<FlushResult> | null>(null);
  const heldRef = useRef(false);
  const setDirtyRef = useRef(setDirty);
  const performSaveRef = useRef(performSave);
  const onSavedRef = useRef(onSaved);
  const getVersionRef = useRef(getVersion);
  const timersRef = useRef(timers);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    setDirtyRef.current = setDirty;
  }, [setDirty]);

  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    getVersionRef.current = getVersion;
  }, [getVersion]);

  useEffect(() => {
    timersRef.current = timers;
  }, [timers]);

  const setAutosaveHeld = useCallback((next: boolean) => {
    heldRef.current = next;
    setHeld(next);
  }, []);

  const bumpEdit = useCallback(() => {
    editGenRef.current += 1;
    setSaveState('idle');
  }, []);

  const save = useCallback((): Promise<FlushResult> => {
    if (!enabled) return Promise.resolve('error');
    if (draftRef.current == null) return Promise.resolve('error');

    if (chainRef.current) {
      pendingRef.current = true;
      return chainRef.current;
    }

    let resolveChain!: (value: FlushResult) => void;
    const promise = new Promise<FlushResult>((resolve) => {
      resolveChain = resolve;
    });
    // Register before any await so concurrent save() callers join this chain.
    chainRef.current = promise;

    void (async () => {
      inFlightRef.current = true;
      let outcome: FlushResult = 'error';

      try {
        for (;;) {
          pendingRef.current = false;
          const genAtStart = editGenRef.current;
          const current = draftRef.current;
          if (current == null) {
            break;
          }

          setSaveState('saving');
          setSaveError(null);

          const result = await performSaveRef.current(
            current,
            versionRef.current,
          );
          if (!result.ok) {
            setSaveState('error');
            setSaveError(
              result.status === 409
                ? conflictMessage
                : `Save failed (${result.status}).`,
            );
            outcome = 'error';
            break;
          }

          versionRef.current = getVersionRef.current(result.entity);
          onSavedRef.current(result.entity);
          lastSavedGenRef.current = genAtStart;

          const unchanged = editGenRef.current === genAtStart;
          if (unchanged && !pendingRef.current) {
            setDirtyRef.current(false);
            setSaveState('saved');
            outcome = 'clean';
            break;
          }

          // Edits (or a queued save) landed while the request was in flight.
          // If Publish holds autosave, stop looping — flush after hold lifts.
          // Do not report clean: pending text is not on the server (CHR-124).
          if (heldRef.current) {
            setDirtyRef.current(true);
            setSaveState('idle');
            outcome = 'pending';
            break;
          }

          setDirtyRef.current(true);
          setSaveState('idle');
        }
      } catch {
        outcome = 'error';
        setSaveState('error');
        setSaveError('Save failed.');
      } finally {
        inFlightRef.current = false;
        chainRef.current = null;
        resolveChain(outcome);
      }
    })();

    return promise;
  }, [conflictMessage, enabled, versionRef]);

  useEffect(() => {
    if (!enabled || !dirty || held) return;
    const handle = timersRef.current.setTimeout(() => {
      if (heldRef.current) return;
      void save();
    }, debounceMs);
    return () => timersRef.current.clearTimeout(handle);
  }, [dirty, draft, debounceMs, enabled, save, held]);

  const awaitInFlight = useCallback((): Promise<FlushResult> => {
    return chainRef.current ?? Promise.resolve('clean');
  }, []);

  return {
    save,
    saveState,
    saveError,
    setSaveError,
    setSaveState,
    bumpEdit,
    setAutosaveHeld,
    /**
     * Resolve when any in-flight PUT chain finishes (or immediately if idle).
     * Delete joins this so DELETE cannot race an autosave PUT (CHR-165).
     */
    awaitInFlight,
    /** Current edit generation — use to detect typing during publish/unpublish. */
    getEditGen: () => editGenRef.current,
    /** Edit generation of the draft last successfully persisted. */
    getLastSavedGen: () => lastSavedGenRef.current,
    /**
     * Treat the current draft as clean (e.g. after Discard restores server
     * content) so a following Publish does not see a stale lastSavedGen.
     */
    markClean: () => {
      lastSavedGenRef.current = editGenRef.current;
      setDirtyRef.current(false);
      setSaveState('saved');
    },
  };
}

/** Merge editor SEO title/description with fields the form does not edit (e.g. ogImage). */
export function mergeEditorSeo(
  existing:
    | { title?: string; description?: string; ogImage?: string }
    | null
    | undefined,
  draft: { seoTitle: string; seoDescription: string },
): { title?: string; description?: string; ogImage?: string } | null {
  const title = draft.seoTitle.trim();
  const description = draft.seoDescription.trim();
  const ogImage = existing?.ogImage;
  if (!title && !description && !ogImage) return null;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(ogImage ? { ogImage } : {}),
  };
}
