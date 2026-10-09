import { useSyncExternalStore } from 'react';

let minClientVersion: string | null = null;
const listeners = new Set<() => void>();

/** Set by a 426; cleared only by a new app version, which starts fresh. */
export const setUpgradeRequired = (minimum: string) => {
  minClientVersion = minimum;
  for (const listener of listeners) listener();
};

export const upgradeRequired = () => minClientVersion;

export const resetUpgradeRequired = () => {
  minClientVersion = null;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useUpgradeRequired = () =>
  useSyncExternalStore(subscribe, upgradeRequired, upgradeRequired);
