import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import type { FlushResult, SaveState } from './useQueuedAutosave'

type MutateResult<TEntity> = {
  data?: TEntity
  error?: unknown
  response: { status: number }
}

/** Subset of `useQueuedAutosave` return used by the publish flow. */
export type DraftPublishAutosave = {
  save: () => Promise<FlushResult>
  setSaveState: (state: SaveState) => void
  setSaveError: (message: string | null) => void
  getEditGen: () => number
  getLastSavedGen: () => number
  /** Align lastSavedGen after Discard so Publish does not look falsely dirty. */
  markClean: () => void
  setAutosaveHeld: (held: boolean) => void
}

type Options<TEntity> = {
  autosave: DraftPublishAutosave
  dirty: boolean
  setDirty: (dirty: boolean) => void
  versionRef: React.MutableRefObject<number>
  getVersion: (entity: TEntity) => number
  /** Update entity metadata only — never replace the live draft. */
  onEntityMeta: (entity: TEntity) => void
  /** Replace draft from the server entity (discard). */
  onReplaceDraft: (entity: TEntity) => void
  publish: () => Promise<MutateResult<TEntity>>
  unpublish: () => Promise<MutateResult<TEntity>>
  discard: () => Promise<MutateResult<TEntity>>
  unpublishConfirm: string
  discardConfirm: string
  enabled?: boolean
}

/**
 * Shared Publish / Unpublish / Discard flow for post, home, and resume editors
 * (CHR-124 / CHR-132): hold autosave, flush without treating pending edits as
 * clean, preserve typing during the request, leave guard, ⌘S / ⌘⏎ shortcuts.
 */
export function useDraftPublishEditor<TEntity>({
  autosave,
  dirty,
  setDirty,
  versionRef,
  getVersion,
  onEntityMeta,
  onReplaceDraft,
  publish,
  unpublish,
  discard,
  unpublishConfirm,
  discardConfirm,
  enabled = true,
}: Options<TEntity>) {
  const {
    save,
    setSaveState,
    setSaveError,
    getEditGen,
    getLastSavedGen,
    markClean,
    setAutosaveHeld,
  } = autosave

  const [busy, setBusy] = useState(false)
  const saveRef = useRef(save)
  const publishRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    saveRef.current = save
  }, [save])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const leave = window.confirm(
      'You have unsaved changes. Leave without saving?',
    )
    if (leave) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  const applyKeepDraft = useCallback(
    (entity: TEntity, baselineGen: number) => {
      onEntityMeta(entity)
      versionRef.current = getVersion(entity)
      if (getEditGen() === baselineGen) {
        setDirty(false)
        setSaveState('saved')
      } else {
        setDirty(true)
        setSaveState('idle')
      }
    },
    [
      getEditGen,
      getVersion,
      onEntityMeta,
      setDirty,
      setSaveState,
      versionRef,
    ],
  )

  const withHold = useCallback(
    async (fn: () => Promise<void>) => {
      if (!enabled || busy) return
      setAutosaveHeld(true)
      setBusy(true)
      setSaveError(null)
      try {
        await fn()
      } finally {
        setAutosaveHeld(false)
        setBusy(false)
      }
    },
    [busy, enabled, setAutosaveHeld, setSaveError],
  )

  const runPublish = useCallback(async () => {
    await withHold(async () => {
      if (dirty) {
        const flush = await save()
        if (flush === 'error') return
      }
      // Baseline is what is actually on the server after the flush — not the
      // edit gen at click time (pending text typed during an in-flight save).
      const baselineGen = getLastSavedGen()
      const { data, error, response } = await publish()
      if (error || !data) {
        setSaveError(`Publish failed (${response.status}).`)
        return
      }
      applyKeepDraft(data, baselineGen)
    })
  }, [
    applyKeepDraft,
    dirty,
    getLastSavedGen,
    publish,
    save,
    setSaveError,
    withHold,
  ])

  useEffect(() => {
    publishRef.current = runPublish
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveRef.current()
      }
      if (meta && event.key === 'Enter') {
        event.preventDefault()
        void publishRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const runUnpublish = useCallback(async () => {
    if (!enabled || busy) return
    if (!window.confirm(unpublishConfirm)) return
    await withHold(async () => {
      if (dirty) {
        const flush = await save()
        if (flush === 'error') return
      }
      const baselineGen = getLastSavedGen()
      const { data, error, response } = await unpublish()
      if (error || !data) {
        setSaveError(`Unpublish failed (${response.status}).`)
        return
      }
      applyKeepDraft(data, baselineGen)
    })
  }, [
    applyKeepDraft,
    busy,
    dirty,
    enabled,
    getLastSavedGen,
    save,
    setSaveError,
    unpublish,
    unpublishConfirm,
    withHold,
  ])

  const runDiscard = useCallback(async () => {
    if (!enabled || busy) return
    if (!window.confirm(discardConfirm)) return
    await withHold(async () => {
      const { data, error, response } = await discard()
      if (error || !data) {
        setSaveError(`Discard failed (${response.status}).`)
        return
      }
      onReplaceDraft(data)
      versionRef.current = getVersion(data)
      markClean()
    })
  }, [
    busy,
    discard,
    discardConfirm,
    enabled,
    getVersion,
    markClean,
    onReplaceDraft,
    setSaveError,
    versionRef,
    withHold,
  ])

  return {
    busy,
    setBusy,
    runPublish,
    runUnpublish,
    runDiscard,
  }
}
