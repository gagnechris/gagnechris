/** Injectable timers so hooks never touch `window` (CHR-140). */
export type Timers = {
  setTimeout: (
    handler: () => void,
    timeout?: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
};

export const defaultTimers: Timers = {
  setTimeout: (handler, timeout) => globalThis.setTimeout(handler, timeout),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

/** Injectable confirm (web: `window.confirm`; tests: mock). */
export type ConfirmFn = (message: string) => boolean;
