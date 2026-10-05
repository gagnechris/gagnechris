import { useCallback, useSyncExternalStore } from 'react';

/** Matches the CSS breakpoint where the sidebar becomes the tab bar. */
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
