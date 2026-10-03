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

export type FlushResult = 'clean' | 'pending' | 'error';

type Options<TDraft, TEntity> = {
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
  /** Do not replace the draft here. */
  onSaved: (entity: TEntity) => void;
  conflictMessage: string;
  conflictMessages?: Record<string, string>;
  timers?: Timers;
  retrySignals?: RetrySignals;
  /** Last entry repeats. */
  retryDelaysMs?: readonly number[];
};

export const TOO_LARGE_MESSAGE = `Too large to save: notes and descriptions are limited to ${NOTEBOOK_TEXT_MAX_BYTES / 1000} KB, titles to ${NOTEBOOK_TITLE_MAX_LENGTH} characters and tags to ${NOTEBOOK_TAGS_MAX}.`;

const DEFAULT_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

const isRetryableStatus = (status: number) =>
  status === 0 || status === 408 || status === 429 || status >= 500;

/**
 * Callers must not clobber the live draft with the normalized server response;
 * only update version / metadata via `onSaved`.
 *
 * Hold autosave while Publish/Unpublish/Discard is in flight so debounced saves
 * do not race the version bump. Explicit `save()` still runs; if hold stops it
 * with unsaved edits it returns `'pending'`.
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
  /** State, not a ref, so the debounce effect cancels when hold flips. */
  const [held, setHeld] = useState(false);
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

          // Do not report clean: the pending text is not on the server.
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

  // The debounce will not fire again until the next edit, so retryable
  // failures need their own loop.
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

  // Unmount cancels the debounce timer; flush instead of dropping edits.
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
    /** Delete joins this so DELETE cannot race an autosave PUT. */
    awaitInFlight,
    getEditGen: () => editGenRef.current,
    getLastSavedGen: () => lastSavedGenRef.current,
    /** After Discard restores server content, so a following Publish does not see a stale lastSavedGen. */
    markClean: () => {
      lastSavedGenRef.current = editGenRef.current;
      setDirtyRef.current(false);
      setSaveState('saved');
    },
  };
}
