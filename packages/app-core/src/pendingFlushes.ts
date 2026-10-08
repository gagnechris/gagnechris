import { defaultTimers } from './platform.js';
import type { FlushResult } from './useQueuedAutosave.js';

/**
 * Edits whose editor unmounted before they reached the server, keyed per
 * document. Memory only: a reload or sign-out drops them, and the web shell
 * warns on unload while any remain.
 */
export type PendingFlush = {
  draft: () => unknown;
  version: () => number;
  /** Stops further retries; resolves once any in-flight attempt settles. */
  settle: () => Promise<FlushResult>;
};

const pending = new Map<string, PendingFlush>();
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of [...listeners]) listener();
};

/** A hung request must not leave the remounted editor loading forever. */
const SETTLE_TIMEOUT_MS = 15_000;

export const hasPendingFlushes = (): boolean => pending.size > 0;

export const pendingFlushCount = (): number => pending.size;

/** Called whenever the queue gains or loses an entry. */
export const subscribePendingFlushes = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const peekPendingFlush = (key: string): PendingFlush | undefined =>
  pending.get(key);

/** Removes the entry; the caller now owns the draft. */
export const takePendingFlush = async (
  key: string,
): Promise<{
  outcome: FlushResult;
  draft: unknown;
  version: number;
} | null> => {
  const entry = pending.get(key);
  if (!entry) return null;
  let handle = 0;
  const outcome = await Promise.race([
    entry.settle(),
    new Promise<FlushResult>((resolve) => {
      handle = defaultTimers.setTimeout(
        () => resolve('pending'),
        SETTLE_TIMEOUT_MS,
      );
    }),
  ]);
  defaultTimers.clearTimeout(handle);
  if (pending.get(key) === entry) {
    pending.delete(key);
    notify();
  }
  return { outcome, draft: entry.draft(), version: entry.version() };
};

export const registerPendingFlush = (key: string, entry: PendingFlush) => {
  pending.set(key, entry);
  notify();
};

export const resolvePendingFlush = (key: string, entry: PendingFlush) => {
  if (pending.get(key) !== entry) return;
  pending.delete(key);
  notify();
};

export const clearPendingFlushes = () => {
  if (pending.size === 0) return;
  for (const entry of pending.values()) void entry.settle();
  pending.clear();
  notify();
};
