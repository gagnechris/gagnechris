import { useSyncExternalStore } from 'react';
import { saveLabel, type SaveState } from '@gagnechris/shared';

type Props = {
  saveState: SaveState;
  dirty: boolean;
  isNew?: boolean;
  /** Screen readers still hear routine states; only offline shows. */
  quiet?: boolean;
};

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

export function SaveIndicator({ saveState, dirty, isNew, quiet }: Props) {
  const offline = useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );
  const label = saveLabel(saveState, dirty, { isNew, offline });
  const hidden = quiet && !(offline && (dirty || saveState === 'error'));
  return (
    <span
      className="workspace-save-indicator"
      data-state={saveState}
      role="status"
      aria-live="polite"
    >
      {hidden ? <span className="kit-visually-hidden">{label}</span> : label}
    </span>
  );
}
