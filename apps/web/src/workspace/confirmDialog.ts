import type { ConfirmFn } from '@gagnechris/app-core';

export type ConfirmRequest = {
  message: string;
  action: string;
  resolve: (ok: boolean) => void;
};

let current: ConfirmRequest | null = null;
const listeners = new Set<() => void>();

const set = (next: ConfirmRequest | null) => {
  current = next;
  for (const listener of listeners) listener();
};

export const confirmStore = {
  get: () => current,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  answer: (ok: boolean) => {
    const request = current;
    if (!request) return;
    set(null);
    request.resolve(ok);
  },
};

/** Asks in the app's `ConfirmDialogHost`; a newer question cancels an open one. */
export const appConfirm: ConfirmFn = (message, action = 'OK') =>
  new Promise((resolve) => {
    current?.resolve(false);
    set({ message, action, resolve });
  });
