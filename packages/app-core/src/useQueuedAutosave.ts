import { useCallback, useEffect, useRef, useState } from 'react';
import {
  registerPendingFlush,
  resolvePendingFlush,
  type PendingFlush,
} from './pendingFlushes.js';
import { defaultTimers, type RetrySignals, type Timers } from './platform.js';
import { useLatest } from './useLatest.js';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type AutosaveResult<TEntity> =
  | { ok: true; entity: TEntity }
  | { ok: false; status: number; error?: string; current?: TEntity };

export type FlushResult = 'clean' | 'pending' | 'error';

type Options<TDraft, TEntity> = {
  draft: TDraft | null | undefined;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  enabled?: boolean;
  debounceMs?: number;
  /** The version the next save sends. */
  getBaseVersion: () => number;
  performSave: (
    draft: TDraft,
    version: number,
  ) => Promise<AutosaveResult<TEntity>>;
  /**
   * Must record the entity's version, which the next save reads through
   * `getBaseVersion`. Do not replace the draft here.
   */
  onSaved: (entity: TEntity) => void;
  /**
   * Whether a version conflict's `current` already holds everything `draft`
   * sends. If it holds this draft, the save counts as done with `current`; if
   * it holds an earlier attempt whose response was lost, that attempt counts
   * as done and this draft is sent again on `current`'s version.
   */
  isSavedIn?: (draft: TDraft, current: TEntity) => boolean;
  conflictMessage: string;
  conflictMessages?: Record<string, string>;
  /** Shown for a 413; each resource states its own limits. */
  tooLargeMessage: string;
  timers?: Timers;
  retrySignals?: RetrySignals;
  /** Last entry repeats. */
  retryDelaysMs?: readonly number[];
  /**
   * Identifies the document. With a key, edits still unsaved at unmount keep
   * retrying in the background until a remount of the same key adopts them.
   */
  queueKey?: string;
};

/** Backoff between retries of a failed save that is safe to retry. */
export const AUTOSAVE_RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

const isRetryableStatus = (status: number) =>
  status === 0 || status === 408 || status === 429 || status >= 500;

// Other 409 codes (deleted, slug_taken, daily_taken, payload_mismatch) are not
// a stale version, so a matching `current` proves nothing.
const isVersionConflict = (status: number, error: string | undefined) =>
  status === 412 ||
  (status === 409 &&
    (error === undefined ||
      error === 'conflict' ||
      error === 'version_conflict'));

// Drafts of failed attempts that may still have reached the server. Each can be
// up to a note body, so only the latest few are kept.
const MAX_UNCONFIRMED = 10;

/**
 * Callers must not clobber the live draft with the normalized server response;
 * only update version / metadata via `onSaved`.
 *
 * Hold autosave while Publish/Unpublish/Discard is in flight so debounced saves
 * do not race the version bump. Explicit `save()` still runs; if hold stops it
 * with unsaved edits it returns `'pending'`.
 */
/** Quiet time after the last edit before autosave sends it. */
export const AUTOSAVE_DEBOUNCE_MS = 900;

export function useQueuedAutosave<TDraft, TEntity>({
  draft,
  dirty,
  setDirty,
  enabled = true,
  debounceMs = AUTOSAVE_DEBOUNCE_MS,
  getBaseVersion,
  performSave,
  onSaved,
  isSavedIn,
  conflictMessage,
  conflictMessages,
  tooLargeMessage,
  timers = defaultTimers,
  retrySignals,
  retryDelaysMs = AUTOSAVE_RETRY_DELAYS_MS,
  queueKey,
}: Options<TDraft, TEntity>) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  /** State, not a ref, so the debounce effect cancels when hold flips. */
  const [held, setHeld] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);

  const draftRef = useLatest(draft);
  const dirtyRef = useLatest(dirty);
  const setDirtyRef = useLatest(setDirty);
  const getBaseVersionRef = useLatest(getBaseVersion);
  const performSaveRef = useLatest(performSave);
  const onSavedRef = useLatest(onSaved);
  const isSavedInRef = useLatest(isSavedIn);
  const timersRef = useLatest(timers);
  const retrySignalsRef = useLatest(retrySignals);
  const retryDelaysRef = useLatest(retryDelaysMs);
  const queueKeyRef = useLatest(queueKey);
  // Inline message objects must not give save() a new identity each render,
  // which would re-arm the debounce after every failure.
  const conflictMessageRef = useLatest(conflictMessage);
  const conflictMessagesRef = useLatest(conflictMessages);
  const tooLargeMessageRef = useLatest(tooLargeMessage);

  const editGenRef = useRef(0);
  const lastSavedGenRef = useRef(0);
  const pendingRef = useRef(false);
  const chainRef = useRef<Promise<FlushResult> | null>(null);
  const heldRef = useRef(false);
  const lastFailureRetryableRef = useRef(false);
  const unconfirmedRef = useRef<TDraft[]>([]);
  // A signal that lands before the retry loop is armed (mid-request, or
  // between the failure and the next commit) would otherwise be lost.
  const signalledSinceSendRef = useRef(false);
  const retryNowRef = useRef<(() => void) | null>(null);

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
      let outcome: FlushResult = 'error';

      try {
        for (;;) {
          pendingRef.current = false;
          signalledSinceSendRef.current = false;
          const genAtStart = editGenRef.current;
          const current = draftRef.current;
          if (current == null) {
            break;
          }

          setSaveState('saving');
          setSaveError(null);

          let result = await performSaveRef.current(
            current,
            getBaseVersionRef.current(),
          );
          if (
            !result.ok &&
            result.current !== undefined &&
            isVersionConflict(result.status, result.error)
          ) {
            const stored = result.current;
            const isSavedIn = isSavedInRef.current;
            if (isSavedIn?.(current, stored)) {
              result = { ok: true, entity: stored };
            } else if (
              isSavedIn &&
              unconfirmedRef.current.some((sent) => isSavedIn(sent, stored))
            ) {
              unconfirmedRef.current = [];
              onSavedRef.current(stored);
              continue;
            }
          }
          if (!result.ok) {
            const retryable = isRetryableStatus(result.status);
            if (retryable) {
              const unconfirmed = unconfirmedRef.current;
              if (!unconfirmed.includes(current)) {
                unconfirmedRef.current = [...unconfirmed, current].slice(
                  -MAX_UNCONFIRMED,
                );
              }
            } else {
              unconfirmedRef.current = [];
            }
            lastFailureRetryableRef.current = retryable;
            setSaveState('error');
            setRetryAttempt((n) => (retryable ? n + 1 : 0));
            const codeMessage = result.error
              ? conflictMessagesRef.current?.[result.error]
              : undefined;
            setSaveError(
              result.status === 409 || result.status === 412
                ? (codeMessage ?? conflictMessageRef.current)
                : result.status === 413
                  ? tooLargeMessageRef.current
                  : `Save failed (${result.status}).`,
            );
            outcome = 'error';
            break;
          }

          unconfirmedRef.current = [];
          setRetryAttempt(0);
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
        lastFailureRetryableRef.current = true;
        setRetryAttempt((n) => n + 1);
        setSaveState('error');
        setSaveError('Save failed.');
      } finally {
        chainRef.current = null;
        resolveChain(outcome);
      }
    })();

    return promise;
  }, [enabled]);

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
  useEffect(() => {
    if (!enabled || !dirty) return;
    return retrySignalsRef.current?.(() => {
      signalledSinceSendRef.current = true;
      retryNowRef.current?.();
    });
  }, [dirty, enabled]);
  useEffect(() => {
    if (!enabled || !dirty || held || retryAttempt === 0) return;
    const retry = () => {
      if (heldRef.current || chainRef.current) return;
      void save();
    };
    const delay = signalledSinceSendRef.current
      ? 0
      : (retryDelaysMs[Math.min(retryAttempt, retryDelaysMs.length) - 1] ?? 0);
    const handle = timersRef.current.setTimeout(retry, delay);
    retryNowRef.current = retry;
    return () => {
      timersRef.current.clearTimeout(handle);
      if (retryNowRef.current === retry) retryNowRef.current = null;
    };
  }, [dirty, enabled, held, retryAttempt, retryDelaysMs, save]);

  // Unmount cancels the debounce timer; flush instead of dropping edits.
  const saveRef = useLatest(save);
  useEffect(
    () => () => {
      if (heldRef.current) return;
      if (!dirtyRef.current && editGenRef.current === lastSavedGenRef.current)
        return;
      const key = queueKeyRef.current;
      if (!key) {
        void saveRef.current();
        return;
      }
      // save() keeps working after unmount: it reads refs, and React ignores
      // the state updates.
      let stopped = false;
      // Set by a signal that lands mid-request, so it is not lost.
      let signalled = false;
      let wake: (() => void) | null = null;
      const unsubscribe = retrySignalsRef.current?.(() => {
        signalled = true;
        wake?.();
      });
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          const t = timersRef.current;
          const handle = t.setTimeout(() => wake?.(), ms);
          wake = () => {
            t.clearTimeout(handle);
            wake = null;
            resolve();
          };
        });
      const entry: PendingFlush = {
        draft: () => draftRef.current,
        version: () => getBaseVersionRef.current(),
        settle: () => {
          stopped = true;
          wake?.();
          return run;
        },
      };
      const run = (async (): Promise<FlushResult> => {
        try {
          for (let attempt = 1; ; attempt += 1) {
            signalled = false;
            const outcome = await saveRef.current();
            if (outcome === 'clean') {
              resolvePendingFlush(key, entry);
              return outcome;
            }
            if (stopped || !lastFailureRetryableRef.current) return outcome;
            if (!signalled) {
              const delays = retryDelaysRef.current;
              await wait(delays[Math.min(attempt, delays.length) - 1] ?? 0);
            }
            if (stopped) return outcome;
          }
        } finally {
          unsubscribe?.();
        }
      })();
      registerPendingFlush(key, entry);
    },
    [],
  );

  const awaitInFlight = useCallback((): Promise<FlushResult> => {
    return chainRef.current ?? Promise.resolve('clean');
  }, []);

  const getEditGen = useCallback(() => editGenRef.current, []);
  const getLastSavedGen = useCallback(() => lastSavedGenRef.current, []);
  const markClean = useCallback(() => {
    lastSavedGenRef.current = editGenRef.current;
    setDirtyRef.current(false);
    setSaveState('saved');
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
    getEditGen,
    getLastSavedGen,
    /** After Discard restores server content, so a following Publish does not see a stale lastSavedGen. */
    markClean,
  };
}
