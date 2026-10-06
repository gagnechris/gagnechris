import { useSyncExternalStore } from 'react';
import type { SaveState } from '@gagnechris/app-core';
import { saveLabel } from './saveLabel';

type Props = {
  saveState: SaveState;
  dirty: boolean;
  isNew?: boolean;
};

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

export function SaveIndicator({ saveState, dirty, isNew }: Props) {
  const offline = useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );
  return (
    <span
      className="admin-save-indicator"
      data-state={saveState}
      role="status"
      aria-live="polite"
    >
      {saveLabel(saveState, dirty, { isNew, offline })}
    </span>
  );
}
