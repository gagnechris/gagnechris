import type { SaveState } from '@gagnechris/app-core';

export function saveLabel(saveState: SaveState, dirty: boolean): string {
  if (saveState === 'saving') return 'Saving…';
  if (dirty) return 'Unsaved changes';
  return 'Saved';
}
