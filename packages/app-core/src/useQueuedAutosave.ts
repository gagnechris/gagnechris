import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NOTEBOOK_TAGS_MAX,
  NOTEBOOK_TEXT_MAX_BYTES,
  NOTEBOOK_TITLE_MAX_LENGTH,
} from '@gagnechris/shared';
import { defaultTimers, type RetrySignals, type Timers } from './platform.js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type AutosaveResult<TEntity> =
  { ok: true; entity: TEntity } | { ok: false; status: number; error?: string };

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
  /**
   * Optional 409 `error` code → message map. Callers that care about a specific
   * conflict (e.g. posts and `slug_taken`) pass the message; the generic hook
   * has no post-specific defaults (CHR-173).
   */
  conflictMessages?: Record<string, string>;
  /** Defaults to `globalThis` timers (no `window`). */
  timers?: Timers;
  /**
   * Extra "try again now" signals for retryable failures (network / 5xx),
   * e.g. the browser `online` event. Backoff retries run regardless (CHR-189).
   */
  retrySignals?: RetrySignals;
  /** Backoff schedule for retryable failures; last entry repeats. */
  retryDelaysMs?: readonly number[];
};

/** 413 from a notebook write: a field is over its limit (CHR-192). */
export const TOO_LARGE_MESSAGE = `Too large to save: notes and descriptions are limited to ${NOTEBOOK_TEXT_MAX_BYTES / 1000} KB, titles to ${NOTEBOOK_TITLE_MAX_LENGTH} characters and tags to ${NOTEBOOK_TAGS_MAX}.`;

const DEFAULT_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/** Network errors (0), rate limits and server errors are worth retrying. */
const isRetryableStatus = (status: number) =>
  status === 0 || status === 408 || status === 429 || status >= 500;

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
  conflictMessages,
  timers = defaultTimers,
  retrySignals,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
}: Options<TDraft, TEntity>) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Re-render token so debounce effect cancels when hold flips. */
  const [held, setHeld] = useState(false);
  /** Consecutive retryable failures; > 0 arms the retry loop (CHR-189). */
  const [retryAttempt, setRetryAttempt] = useState(0);

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
            setRetryAttempt((n) =>
              isRetryableStatus(result.status) ? n + 1 : 0,
            );
            const codeMessage =
              result.error && conflictMessages
                ? conflictMessages[result.error]
                : undefined;
            setSaveError(
              result.status === 409
                ? (codeMessage ?? conflictMessage)
                : result.status === 413
                  ? TOO_LARGE_MESSAGE
                  : `Save failed (${result.status}).`,
            );
            outcome = 'error';
            break;
          }

          setRetryAttempt(0);
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
        setRetryAttempt((n) => n + 1);
        setSaveState('error');
        setSaveError('Save failed.');
      } finally {
        inFlightRef.current = false;
        chainRef.current = null;
        resolveChain(outcome);
      }
    })();

    return promise;
  }, [conflictMessage, conflictMessages, enabled, versionRef]);

  useEffect(() => {
    if (!enabled || !dirty || held) return;
    const handle = timersRef.current.setTimeout(() => {
      if (heldRef.current) return;
      void save();
    }, debounceMs);
    return () => timersRef.current.clearTimeout(handle);
  }, [dirty, draft, debounceMs, enabled, save, held]);

  // After a retryable failure the debounce above will not fire again until the
  // next edit, so retry on a backoff timer and on any injected signal (e.g.
  // back online) until a save lands or a non-retryable error stops it.
  const retrySignalsRef = useRef(retrySignals);
  useEffect(() => {
    retrySignalsRef.current = retrySignals;
  }, [retrySignals]);
  useEffect(() => {
    if (!enabled || !dirty || held || retryAttempt === 0) return;
    const retry = () => {
      if (heldRef.current || chainRef.current) return;
      void save();
    };
    const delay =
      retryDelaysMs[Math.min(retryAttempt, retryDelaysMs.length) - 1] ?? 0;
    const handle = timersRef.current.setTimeout(retry, delay);
    const unsubscribe = retrySignalsRef.current?.(retry);
    return () => {
      timersRef.current.clearTimeout(handle);
      unsubscribe?.();
    };
  }, [dirty, enabled, held, retryAttempt, retryDelaysMs, save]);

  // Unmount (route change, editor re-keyed by date/area) cancels the debounce
  // timer above; flush unsaved edits instead of dropping them (CHR-189).
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  useEffect(
    () => () => {
      if (heldRef.current) return;
      if (editGenRef.current === lastSavedGenRef.current) return;
      void saveRef.current();
    },
    [],
  );

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
