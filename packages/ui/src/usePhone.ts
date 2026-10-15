import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';

const media = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;

const subscribe = (onChange: () => void) => {
  const list = media();
  list?.addEventListener('change', onChange);
  return () => list?.removeEventListener('change', onChange);
};

/** True under 768px, where menus and dialogs open as bottom sheets. */
export const usePhone = () =>
  useSyncExternalStore(
    subscribe,
    () => media()?.matches ?? false,
    () => false,
  );
