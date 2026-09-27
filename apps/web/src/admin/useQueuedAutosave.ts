import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export type AutosaveResult<TEntity> =
  | { ok: true; entity: TEntity }
  | { ok: false; status: number }

type Options<TDraft, TEntity> = {
  /** Latest draft; also used as the debounce dependency. */
  draft: TDraft | null | undefined
  dirty: boolean
  setDirty: (dirty: boolean) => void
  enabled?: boolean
  debounceMs?: number
  versionRef: React.MutableRefObject<number>
  getVersion: (entity: TEntity) => number
  performSave: (
    draft: TDraft,
    version: number,
  ) => Promise<AutosaveResult<TEntity>>
  /** Update entity metadata (version, updatedAt, status, seo). Do not replace the draft here. */
  onSaved: (entity: TEntity) => void
  conflictMessage: string
}

/**
 * Single-flight autosave with a latest-draft queue.
 * After a successful save, callers must not clobber the live draft with a
 * normalized server response — only update version / metadata via `onSaved`.
 * Dirty clears only when nothing was typed since the request that just finished.
 */
export function useQueuedAutosave<TDraft, TEntity>({
  draft,
  dirty,
  setDirty,
  enabled = true,
  debounceMs = 900,
  versionRef,
  getVersion,
  performSave,
  onSaved,
  conflictMessage,
}: Options<TDraft, TEntity>) {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const draftRef = useRef(draft)
  const editGenRef = useRef(0)
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)
  const chainRef = useRef<Promise<boolean> | null>(null)
  const setDirtyRef = useRef(setDirty)
  const performSaveRef = useRef(performSave)
  const onSavedRef = useRef(onSaved)
  const getVersionRef = useRef(getVersion)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    setDirtyRef.current = setDirty
  }, [setDirty])

  useEffect(() => {
    performSaveRef.current = performSave
  }, [performSave])

  useEffect(() => {
    onSavedRef.current = onSaved
  }, [onSaved])

  useEffect(() => {
    getVersionRef.current = getVersion
  }, [getVersion])

  const bumpEdit = useCallback(() => {
    editGenRef.current += 1
    setSaveState('idle')
  }, [])

  const save = useCallback((): Promise<boolean> => {
    if (!enabled) return Promise.resolve(false)
    if (draftRef.current == null) return Promise.resolve(false)

    if (chainRef.current) {
      pendingRef.current = true
      return chainRef.current
    }

    let resolveChain!: (value: boolean) => void
    const promise = new Promise<boolean>((resolve) => {
      resolveChain = resolve
    })
    // Register before any await so concurrent save() callers join this chain.
    chainRef.current = promise

    void (async () => {
      inFlightRef.current = true
      let allOk = false

      try {
        for (;;) {
          pendingRef.current = false
          const genAtStart = editGenRef.current
          const current = draftRef.current
          if (current == null) {
            break
          }

          setSaveState('saving')
          setSaveError(null)

          const result = await performSaveRef.current(
            current,
            versionRef.current,
          )
          if (!result.ok) {
            setSaveState('error')
            setSaveError(
              result.status === 409
                ? conflictMessage
                : `Save failed (${result.status}).`,
            )
            break
          }

          versionRef.current = getVersionRef.current(result.entity)
          onSavedRef.current(result.entity)

          const unchanged = editGenRef.current === genAtStart
          if (unchanged && !pendingRef.current) {
            setDirtyRef.current(false)
            setSaveState('saved')
            allOk = true
            break
          }

          // Edits (or a queued save) landed while the request was in flight.
          setDirtyRef.current(true)
          setSaveState('idle')
        }
      } catch {
        allOk = false
        setSaveState('error')
        setSaveError('Save failed.')
      } finally {
        inFlightRef.current = false
        chainRef.current = null
        resolveChain(allOk)
      }
    })()

    return promise
  }, [conflictMessage, enabled, versionRef])

  useEffect(() => {
    if (!enabled || !dirty) return
    const handle = window.setTimeout(() => {
      void save()
    }, debounceMs)
    return () => window.clearTimeout(handle)
  }, [dirty, draft, debounceMs, enabled, save])

  return {
    save,
    saveState,
    saveError,
    setSaveError,
    setSaveState,
    bumpEdit,
    /** Current edit generation — use to detect typing during publish/unpublish. */
    getEditGen: () => editGenRef.current,
  }
}

/** Merge editor SEO title/description with fields the form does not edit (e.g. ogImage). */
export function mergeEditorSeo(
  existing:
    | { title?: string; description?: string; ogImage?: string }
    | null
    | undefined,
  draft: { seoTitle: string; seoDescription: string },
): { title?: string; description?: string; ogImage?: string } | null {
  const title = draft.seoTitle.trim()
  const description = draft.seoDescription.trim()
  const ogImage = existing?.ogImage
  if (!title && !description && !ogImage) return null
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(ogImage ? { ogImage } : {}),
  }
}
