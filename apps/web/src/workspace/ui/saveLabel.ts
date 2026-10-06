import type { SaveState } from '@gagnechris/app-core';

export type SaveLabelOptions = {
  /** The entity exists only on this device so far. */
  isNew?: boolean;
  offline?: boolean;
};

export function saveLabel(
  saveState: SaveState,
  dirty: boolean,
  { isNew = false, offline = false }: SaveLabelOptions = {},
): string {
  if (saveState === 'saving') return 'Saving…';
  if (offline && (dirty || saveState === 'error')) {
    return 'Offline, will retry';
  }
  if (dirty) return 'Unsaved changes';
  if (isNew) return 'Not saved yet';
  return 'Saved';
}
