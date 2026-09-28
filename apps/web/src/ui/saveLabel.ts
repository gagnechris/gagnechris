import type { SaveState } from '../admin/useQueuedAutosave'

export function saveLabel(saveState: SaveState, dirty: boolean): string {
  if (saveState === 'saving') return 'Saving…'
  if (dirty) return 'Unsaved changes'
  return 'Saved'
}
