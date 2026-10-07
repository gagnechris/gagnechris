import { useCallback, useSyncExternalStore } from 'react';

/**
 * Where the workspace sidebar becomes the tab bar: `breakpoint.tabBar` in
 * @gagnechris/tokens, written out because importing the tokens into the
 * public entry splits them into a chunk of their own (breakpoints.test.ts).
 */
export const PHONE_QUERY = '(max-width: 767px)';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia?.(query);
      mql?.addEventListener('change', onChange);
      return () => mql?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => Boolean(window.matchMedia?.(query).matches),
    () => false,
  );
}
