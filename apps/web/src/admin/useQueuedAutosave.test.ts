import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import {
  mergeEditorSeo,
  useQueuedAutosave,
} from './useQueuedAutosave'

describe('mergeEditorSeo', () => {
  test('preserves ogImage when title/description change', () => {
    expect(
      mergeEditorSeo(
        { title: 'Old', description: 'Old desc', ogImage: '/og.png' },
        { seoTitle: 'New', seoDescription: 'New desc' },
      ),
    ).toEqual({
      title: 'New',
      description: 'New desc',
      ogImage: '/og.png',
    })
  })

  test('keeps ogImage-only seo when title and description are cleared', () => {
    expect(
      mergeEditorSeo(
        { ogImage: 'https://cdn.example/x.png' },
        { seoTitle: '  ', seoDescription: '' },
      ),
    ).toEqual({ ogImage: 'https://cdn.example/x.png' })
  })

  test('returns null when nothing remains', () => {
    expect(
      mergeEditorSeo(null, { seoTitle: '', seoDescription: '' }),
    ).toBeNull()
  })
})

describe('useQueuedAutosave', () => {
  test('queues latest draft when edits land during an in-flight save', async () => {
    const resolvers: Array<
      (value: { ok: true; entity: { version: number } }) => void
    > = []
    const performSave = vi.fn((...args: [string, number]) => {
      void args
      return new Promise<{ ok: true; entity: { version: number } }>((resolve) => {
        resolvers.push(resolve)
      })
    })
    const versionRef = { current: 1 }
    const onSaved = vi.fn()

    const { result } = renderHook(() => {
      const [draft, setDraft] = useState('Hello')
      const [dirty, setDirty] = useState(true)
      const autosave = useQueuedAutosave({
        draft,
        dirty,
        setDirty,
        debounceMs: 10_000,
        versionRef,
        getVersion: (e) => e.version,
        performSave,
        onSaved,
        conflictMessage: 'Conflict',
      })
      return { ...autosave, setDraft, dirty }
    })

    let savePromise!: Promise<boolean>
    act(() => {
      savePromise = result.current.save()
    })
    expect(performSave).toHaveBeenCalledTimes(1)
    expect(performSave.mock.calls[0]?.[0]).toBe('Hello')

    act(() => {
      result.current.bumpEdit()
      result.current.setDraft('Hello world')
    })

    await act(async () => {
      resolvers[0]!({ ok: true, entity: { version: 2 } })
    })

    await waitFor(() => {
      expect(performSave).toHaveBeenCalledTimes(2)
    })
    expect(performSave.mock.calls[1]?.[0]).toBe('Hello world')
    expect(performSave.mock.calls[1]?.[1]).toBe(2)

    await act(async () => {
      resolvers[1]!({ ok: true, entity: { version: 3 } })
      await expect(savePromise).resolves.toBe(true)
    })

    expect(onSaved).toHaveBeenCalledTimes(2)
    expect(versionRef.current).toBe(3)
  })

  test('serializes overlapping saves so versions stay monotonic', async () => {
    const resolvers: Array<
      (value: { ok: true; entity: { version: number } }) => void
    > = []
    const performSave = vi.fn((...args: [string, number]) => {
      void args
      return new Promise<{ ok: true; entity: { version: number } }>((resolve) => {
        resolvers.push(resolve)
      })
    })
    const versionRef = { current: 1 }

    const { result } = renderHook(() => {
      const [draft, setDraft] = useState('a')
      const [dirty, setDirty] = useState(true)
      const autosave = useQueuedAutosave({
        draft,
        dirty,
        setDirty,
        debounceMs: 10_000,
        versionRef,
        getVersion: (e) => e.version,
        performSave,
        onSaved: () => {},
        conflictMessage: 'Conflict',
      })
      return { ...autosave, setDraft }
    })

    let first!: Promise<boolean>
    act(() => {
      first = result.current.save()
    })

    act(() => {
      result.current.bumpEdit()
      result.current.setDraft('ab')
    })

    let second!: Promise<boolean>
    act(() => {
      second = result.current.save()
    })

    expect(performSave).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)

    await act(async () => {
      resolvers[0]!({ ok: true, entity: { version: 2 } })
    })

    await waitFor(() => expect(performSave).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolvers[1]!({ ok: true, entity: { version: 3 } })
      await expect(first).resolves.toBe(true)
      await expect(second).resolves.toBe(true)
    })

    expect(performSave.mock.calls.map((c) => c[1])).toEqual([1, 2])
    expect(versionRef.current).toBe(3)
  })

  test('hold suppresses debounced autosave until released (CHR-121)', async () => {
    vi.useFakeTimers()
    const performSave = vi.fn(async (_draft: string, version: number) => ({
      ok: true as const,
      entity: { version: version + 1 },
    }))
    const versionRef = { current: 1 }

    const { result } = renderHook(() => {
      const [draft, setDraft] = useState('published-at-click')
      const [dirty, setDirty] = useState(true)
      const autosave = useQueuedAutosave({
        draft,
        dirty,
        setDirty,
        debounceMs: 900,
        versionRef,
        getVersion: (e) => e.version,
        performSave,
        onSaved: () => {},
        conflictMessage: 'Conflict',
      })
      return { ...autosave, setDraft, setDirty, dirty }
    })

    act(() => {
      result.current.setAutosaveHeld(true)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(performSave).not.toHaveBeenCalled()

    act(() => {
      result.current.bumpEdit()
      result.current.setDraft('typed-during-publish')
      result.current.setDirty(true)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(performSave).not.toHaveBeenCalled()

    // Explicit flush still works while held (publish path).
    await act(async () => {
      await result.current.save()
    })
    expect(performSave).toHaveBeenCalledTimes(1)
    expect(performSave.mock.calls[0]?.[0]).toBe('typed-during-publish')

    act(() => {
      result.current.bumpEdit()
      result.current.setDraft('after-publish')
      result.current.setDirty(true)
      result.current.setAutosaveHeld(false)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
    })
    expect(performSave).toHaveBeenCalledTimes(2)
    expect(performSave.mock.calls[1]?.[0]).toBe('after-publish')
    expect(performSave.mock.calls[1]?.[1]).toBe(2)

    vi.useRealTimers()
  })
})
