import { describe, expect, test, vi } from 'vitest';
import { mergeEditorSeo } from '../src/mergeEditorSeo.js';
import {
  useQueuedAutosave,
  type FlushResult,
} from '../src/useQueuedAutosave.js';
import { defaultTimers } from '../src/platform.js';
import { act, renderHook, useState } from './renderHook.js';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

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
    });
  });

  test('keeps ogImage-only seo when title and description are cleared', () => {
    expect(
      mergeEditorSeo(
        { ogImage: 'https://cdn.example/x.png' },
        { seoTitle: '  ', seoDescription: '' },
      ),
    ).toEqual({ ogImage: 'https://cdn.example/x.png' });
  });

  test('returns null when nothing remains', () => {
    expect(
      mergeEditorSeo(null, { seoTitle: '', seoDescription: '' }),
    ).toBeNull();
  });
});

describe('useQueuedAutosave', () => {
  test('queues latest draft when edits land during an in-flight save', async () => {
    const resolvers: Array<
      (value: { ok: true; entity: { version: number } }) => void
    > = [];
    const performSave = vi.fn((...args: [string, number]) => {
      void args;
      return new Promise<{ ok: true; entity: { version: number } }>(
        (resolve) => {
          resolvers.push(resolve);
        },
      );
    });
    const versionRef = { current: 1 };
    const onSaved = vi.fn();

    const { result } = renderHook(() => {
      const [draft, setDraft] = useState('Hello');
      const [dirty, setDirty] = useState(true);
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
      });
      return { ...autosave, setDraft, dirty };
    });

    let savePromise!: Promise<FlushResult>;
    act(() => {
      savePromise = result.current.save();
    });
    expect(performSave).toHaveBeenCalledTimes(1);
    expect(performSave.mock.calls[0]?.[0]).toBe('Hello');

    act(() => {
      result.current.bumpEdit();
      result.current.setDraft('Hello world');
    });

    await act(async () => {
      resolvers[0]!({ ok: true, entity: { version: 2 } });
    });
    await flush();

    expect(performSave).toHaveBeenCalledTimes(2);
    expect(performSave.mock.calls[1]?.[0]).toBe('Hello world');
    expect(performSave.mock.calls[1]?.[1]).toBe(2);

    await act(async () => {
      resolvers[1]!({ ok: true, entity: { version: 3 } });
      await expect(savePromise).resolves.toBe('clean');
    });

    expect(onSaved).toHaveBeenCalledTimes(2);
    expect(versionRef.current).toBe(3);
  });

  test('serializes overlapping saves so versions stay monotonic', async () => {
    const resolvers: Array<
      (value: { ok: true; entity: { version: number } }) => void
    > = [];
    const performSave = vi.fn((...args: [string, number]) => {
      void args;
      return new Promise<{ ok: true; entity: { version: number } }>(
        (resolve) => {
          resolvers.push(resolve);
        },
      );
    });
    const versionRef = { current: 1 };

    const { result } = renderHook(() => {
      const [draft, setDraft] = useState('a');
      const [dirty, setDirty] = useState(true);
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
      });
      return { ...autosave, setDraft };
    });

    let first!: Promise<FlushResult>;
    act(() => {
      first = result.current.save();
    });

    act(() => {
      result.current.bumpEdit();
      result.current.setDraft('ab');
    });

    let second!: Promise<FlushResult>;
    act(() => {
      second = result.current.save();
    });

    expect(performSave).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    await act(async () => {
      resolvers[0]!({ ok: true, entity: { version: 2 } });
    });
    await flush();
    expect(performSave).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvers[1]!({ ok: true, entity: { version: 3 } });
      await expect(first).resolves.toBe('clean');
      await expect(second).resolves.toBe('clean');
    });

    expect(performSave.mock.calls.map((c) => c[1])).toEqual([1, 2]);
    expect(versionRef.current).toBe(3);
  });

  test('held flush with edits mid-save returns pending, not clean', async () => {
    const resolvers: Array<
      (value: { ok: true; entity: { version: number } }) => void
    > = [];
    const performSave = vi.fn((...args: [string, number]) => {
      void args;
      return new Promise<{ ok: true; entity: { version: number } }>(
        (resolve) => {
          resolvers.push(resolve);
        },
      );
    });
    const versionRef = { current: 1 };

    const { result } = renderHook(() => {
      const [draft, setDraft] = useState('Hello');
      const [dirty, setDirty] = useState(true);
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
      });
      return { ...autosave, setDraft, dirty };
    });

    let savePromise!: Promise<FlushResult>;
    act(() => {
      savePromise = result.current.save();
    });

    act(() => {
      result.current.setAutosaveHeld(true);
      result.current.bumpEdit();
      result.current.setDraft('Hello world');
    });

    await act(async () => {
      resolvers[0]!({ ok: true, entity: { version: 2 } });
      await expect(savePromise).resolves.toBe('pending');
    });

    expect(performSave).toHaveBeenCalledTimes(1);
    expect(result.current.dirty).toBe(true);
    expect(result.current.saveState).toBe('idle');
    expect(result.current.getLastSavedGen()).toBe(0);
    expect(result.current.getEditGen()).toBe(1);
  });

  test('hold suppresses debounced autosave until released', async () => {
    vi.useFakeTimers();
    const performSave = vi.fn(async (_draft: string, version: number) => ({
      ok: true as const,
      entity: { version: version + 1 },
    }));
    const versionRef = { current: 1 };

    const { result } = renderHook(() => {
      const [draft, setDraft] = useState('published-at-click');
      const [dirty, setDirty] = useState(true);
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
        timers: defaultTimers,
      });
      return { ...autosave, setDraft, setDirty, dirty };
    });

    act(() => {
      result.current.setAutosaveHeld(true);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(performSave).not.toHaveBeenCalled();

    act(() => {
      result.current.bumpEdit();
      result.current.setDraft('typed-during-publish');
      result.current.setDirty(true);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(performSave).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.save();
    });
    expect(performSave).toHaveBeenCalledTimes(1);
    expect(performSave.mock.calls[0]?.[0]).toBe('typed-during-publish');

    act(() => {
      result.current.bumpEdit();
      result.current.setDraft('after-publish');
      result.current.setDirty(true);
      result.current.setAutosaveHeld(false);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(performSave).toHaveBeenCalledTimes(2);
    expect(performSave.mock.calls[1]?.[0]).toBe('after-publish');
    expect(performSave.mock.calls[1]?.[1]).toBe(2);

    vi.useRealTimers();
  });

  test('markClean aligns lastSavedGen after discard', () => {
    const versionRef = { current: 1 };
    const { result } = renderHook(() => {
      const [draft, setDraft] = useState('a');
      const [dirty, setDirty] = useState(false);
      const autosave = useQueuedAutosave({
        draft,
        dirty,
        setDirty,
        debounceMs: 10_000,
        versionRef,
        getVersion: (e: { version: number }) => e.version,
        performSave: async () => ({
          ok: true as const,
          entity: { version: 2 },
        }),
        onSaved: () => {},
        conflictMessage: 'Conflict',
      });
      return { ...autosave, setDraft, setDirty, dirty };
    });

    act(() => {
      result.current.bumpEdit();
      result.current.setDraft('edited');
      result.current.setDirty(true);
    });
    expect(result.current.getEditGen()).toBe(1);
    expect(result.current.getLastSavedGen()).toBe(0);
    expect(result.current.dirty).toBe(true);

    act(() => {
      result.current.markClean();
    });
    expect(result.current.getLastSavedGen()).toBe(1);
    expect(result.current.dirty).toBe(false);
    expect(result.current.saveState).toBe('saved');
  });
});

test('slug_taken 409 shows slug-taken message, not conflictMessage', async () => {
  const performSave = vi.fn(async () => ({
    ok: false as const,
    status: 409,
    error: 'slug_taken',
  }));
  const versionRef = { current: 1 };
  const { result } = renderHook(() => {
    const [draft] = useState('Hello');
    const [dirty, setDirty] = useState(true);
    return useQueuedAutosave({
      draft,
      dirty,
      setDirty,
      debounceMs: 10_000,
      versionRef,
      getVersion: (e: { version: number }) => e.version,
      performSave,
      onSaved: () => {},
      conflictMessage: 'Conflict — Reload and try again.',
      conflictMessages: {
        slug_taken: 'That slug is already taken. Choose a different slug.',
      },
    });
  });

  await act(async () => {
    await result.current.save();
  });
  expect(result.current.saveError).toBe(
    'That slug is already taken. Choose a different slug.',
  );
  expect(result.current.saveError).not.toContain('Reload');
});

describe('useQueuedAutosave recovery', () => {
  const renderEdited = (
    performSave: (
      draft: string,
      version: number,
    ) => Promise<
      | { ok: true; entity: { version: number } }
      | { ok: false; status: number; error?: string }
    >,
    retrySignals?: (retry: () => void) => () => void,
  ) => {
    const versionRef = { current: 1 };
    const hook = renderHook(() => {
      const [draft, setDraft] = useState('a');
      const [dirty, setDirty] = useState(false);
      const autosave = useQueuedAutosave({
        draft,
        dirty,
        setDirty,
        debounceMs: 900,
        versionRef,
        getVersion: (e: { version: number }) => e.version,
        performSave,
        onSaved: () => {},
        conflictMessage: 'Conflict',
        retrySignals,
      });
      return { ...autosave, setDraft, setDirty, dirty };
    });
    act(() => {
      hook.result.current.bumpEdit();
      hook.result.current.setDraft('typed');
      hook.result.current.setDirty(true);
    });
    return hook;
  };

  test('flushes unsaved edits on unmount instead of dropping them', async () => {
    const performSave = vi.fn(async () => ({
      ok: true as const,
      entity: { version: 2 },
    }));
    const { unmount } = renderEdited(performSave);

    unmount();
    await flush();

    expect(performSave).toHaveBeenCalledTimes(1);
    expect(performSave.mock.calls[0]).toEqual(['typed', 1]);
  });

  test('does not save on unmount when nothing is pending', async () => {
    const performSave = vi.fn(async () => ({
      ok: true as const,
      entity: { version: 2 },
    }));
    const { result, unmount } = renderEdited(performSave);
    act(() => {
      result.current.markClean();
    });

    unmount();
    await flush();

    expect(performSave).not.toHaveBeenCalled();
  });

  test('retries a network failure on the retry signal without a new edit', async () => {
    vi.useFakeTimers();
    let online = false;
    const performSave = vi.fn(async () =>
      online
        ? { ok: true as const, entity: { version: 2 } }
        : { ok: false as const, status: 0 },
    );
    let fireRetry: (() => void) | undefined;
    const { result } = renderEdited(performSave, (retry) => {
      fireRetry = retry;
      return () => {
        fireRetry = undefined;
      };
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(result.current.saveError).toBe('Save failed (0).');
    expect(fireRetry).toBeDefined();

    online = true;
    await act(async () => {
      fireRetry?.();
      await Promise.resolve();
    });
    await flush();

    expect(performSave).toHaveBeenCalledTimes(2);
    expect(result.current.saveState).toBe('saved');
    expect(result.current.dirty).toBe(false);
    expect(fireRetry).toBeUndefined();
    vi.useRealTimers();
  });

  test('backs off and retries server errors on its own', async () => {
    vi.useFakeTimers();
    const performSave = vi
      .fn<
        () => Promise<
          | { ok: true; entity: { version: number } }
          | { ok: false; status: number }
        >
      >()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, entity: { version: 2 } });
    const { result } = renderEdited(performSave);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(performSave).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(performSave).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(performSave).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(performSave).toHaveBeenCalledTimes(3);
    expect(result.current.saveState).toBe('saved');
    vi.useRealTimers();
  });

  test('does not retry a conflict', async () => {
    vi.useFakeTimers();
    const performSave = vi.fn(async () => ({
      ok: false as const,
      status: 409,
    }));
    const { result } = renderEdited(performSave);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900 + 120_000);
    });
    expect(performSave).toHaveBeenCalledTimes(1);
    expect(result.current.saveError).toBe('Conflict');
    vi.useRealTimers();
  });
});
