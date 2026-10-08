import type { SaveState } from '@gagnechris/app-core';

export function saveLabel(
  saveState: SaveState,
  dirty: boolean,
  offline: boolean,
): string {
  if (saveState === 'saving') return 'Saving…';
  if (offline && (dirty || saveState === 'error')) return 'Offline';
  if (dirty) return 'Edited';
  return 'Saved';
}
