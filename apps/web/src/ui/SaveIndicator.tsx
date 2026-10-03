import type { SaveState } from '@gagnechris/app-core';
import { saveLabel } from './saveLabel';

type Props = {
  saveState: SaveState;
  dirty: boolean;
};

export function SaveIndicator({ saveState, dirty }: Props) {
  return (
    <span
      className="admin-save-indicator"
      data-state={saveState}
      role="status"
      aria-live="polite"
    >
      {saveLabel(saveState, dirty)}
    </span>
  );
}
