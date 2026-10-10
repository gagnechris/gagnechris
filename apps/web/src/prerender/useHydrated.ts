import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False while hydrating a published page, true after and on any client
 * render, so a part the page doesn't publish can mount without a mismatch.
 */
export const useHydrated = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
