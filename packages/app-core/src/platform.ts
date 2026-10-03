/**
 * Injectable so hooks never touch `window`; handle types are local so
 * app-core needs no DOM lib.
 */
export type TimerHandle = number;

export type Timers = {
  setTimeout: (handler: () => void, timeout?: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
};

type GlobalTimers = {
  setTimeout: (handler: () => void, timeout?: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
};

const globalTimers = globalThis as typeof globalThis & GlobalTimers;

export const defaultTimers: Timers = {
  // Cast: Node typings (via vitest.config) return Timeout; browsers return number.
  setTimeout: (handler, timeout) =>
    globalTimers.setTimeout(handler, timeout) as unknown as TimerHandle,
  clearTimeout: (handle) => globalTimers.clearTimeout(handle),
};

/** Async because React Native's `Alert.alert` is callback-based. */
export type ConfirmFn = (message: string) => Promise<boolean>;

export type RetrySignals = (retry: () => void) => () => void;
