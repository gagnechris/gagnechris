/**
 * Injectable timers so hooks never touch `window` (CHR-140).
 * Timer handle types are local so app-core needs no DOM lib (CHR-164).
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
  setTimeout: (handler, timeout) => globalTimers.setTimeout(handler, timeout),
  clearTimeout: (handle) => globalTimers.clearTimeout(handle),
};

/**
 * Injectable confirm (web: `window.confirm`; tests: mock).
 *
 * Async because React Native's `Alert.alert` is callback-based; the web shell
 * wraps the synchronous `window.confirm` in a resolved promise (CHR-150).
 */
export type ConfirmFn = (message: string) => Promise<boolean>;
