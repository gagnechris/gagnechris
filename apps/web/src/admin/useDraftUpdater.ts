import { useCallback, type Dispatch, type SetStateAction } from 'react'

/**
 * Shared draft field updater: apply a draft transform, bump edit gen, mark dirty.
 * Replaces the copied setField + bumpEdit + setDirty pattern in each editor.
 */
export function useDraftUpdater<T>(
  setDraft: Dispatch<SetStateAction<T>>,
  bumpEdit: () => void,
  setDirty: (dirty: boolean) => void,
): (update: (prev: T) => T) => void {
  return useCallback(
    (update: (prev: T) => T) => {
      setDraft(update)
      bumpEdit()
      setDirty(true)
    },
    [bumpEdit, setDirty, setDraft],
  )
}

/** Variant when draft may be null until hydrated. */
export function useNullableDraftUpdater<T>(
  setDraft: Dispatch<SetStateAction<T | null>>,
  bumpEdit: () => void,
  setDirty: (dirty: boolean) => void,
): (update: (prev: T) => T) => void {
  return useCallback(
    (update: (prev: T) => T) => {
      setDraft((prev) => (prev ? update(prev) : prev))
      bumpEdit()
      setDirty(true)
    },
    [bumpEdit, setDirty, setDraft],
  )
}
