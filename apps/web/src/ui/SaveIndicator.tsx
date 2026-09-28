import type { SaveState } from '../admin/useQueuedAutosave';
import { saveLabel } from './saveLabel';

type Props = {
  saveState: SaveState;
  dirty: boolean;
};

/** Autosave status text (`admin-save-indicator`). */
export function SaveIndicator({ saveState, dirty }: Props) {
  return (
    <span className="admin-save-indicator" data-state={saveState}>
      {saveLabel(saveState, dirty)}
    </span>
  );
}
