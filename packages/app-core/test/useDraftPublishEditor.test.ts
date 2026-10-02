import { describe, expect, test, vi } from 'vitest';
import {
  useDraftPublishEditor,
  type DraftPublishAutosave,
  type DraftPublishHold,
} from '../src/useDraftPublishEditor.js';
import { useQueuedAutosave } from '../src/useQueuedAutosave.js';
import { act, renderHook, useState } from './renderHook.js';
import { useCallback, useRef, useState as useReactState } from 'react';

type Entity = { version: number; body: string };

/** Minimal hold matching `useVersionedDocEditor.withHold` for unit tests. */
function useTestHold(enabled = true): DraftPublishHold & { busy: boolean } {
  const [busy, setBusy] = useReactState(false);
  const busyRef = useRef(false);
  const withHold = useCallback(
    async (fn: () => Promise<void>) => {
      if (!enabled || busyRef.current) return;
      setBusy(true);
      busyRef.current = true;
      try {
        await fn();
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [enabled],
  );
  return { withHold, isBusy: () => busyRef.current, busy };
}

describe('useDraftPublishEditor discard then publish (CHR-145)', () => {
  test('edit → discard → publish leaves clean with no extra save', async () => {
    const confirm = vi.fn(async () => true);
    const performSave = vi.fn(async (_draft: string, version: number) => ({
      ok: true as const,
      entity: { version: version + 1, body: 'from-save' } satisfies Entity,
    }));
    const publish = vi.fn(async () => ({
      data: { version: 5, body: 'published' } satisfies Entity,
      error: undefined,
      response: { status: 200 },
    }));
    const discard = vi.fn(async () => ({
      data: { version: 4, body: 'restored' } satisfies Entity,
      error: undefined,
      response: { status: 200 },
    }));

    const { result } = renderHook(() => {
      const [draft, setDraft] = useState('server');
      const [dirty, setDirty] = useState(false);
      const versionRef = useRef(3);
      const hold = useTestHold();
      const autosave = useQueuedAutosave({
        draft,
        dirty,
        setDirty,
        debounceMs: 10_000,
        versionRef,
        getVersion: (e: Entity) => e.version,
        performSave,
        onSaved: () => {},
        conflictMessage: 'Conflict',
      });
      const editor = useDraftPublishEditor({
        autosave,
        dirty,
        setDirty,
        versionRef,
        getVersion: (e: Entity) => e.version,
        onEntityMeta: () => {},
        onReplaceDraft: (e) => {
          setDraft(e.body);
        },
        publish,
        unpublish: async () => ({
          data: { version: 3, body: 'server' },
          response: { status: 200 },
        }),
        discard,
        unpublishConfirm: 'unpublish?',
        discardConfirm: 'discard?',
        confirm,
        hold,
      });
      return {
        ...autosave,
        ...editor,
        dirty,
        draft,
        setDraft,
        setDirty,
      };
    });

    act(() => {
      result.current.bumpEdit();
      result.current.setDraft('typed-never-saved');
      result.current.setDirty(true);
    });
    expect(result.current.dirty).toBe(true);
    expect(result.current.getEditGen()).toBeGreaterThan(
      result.current.getLastSavedGen(),
    );

    await act(async () => {
      await result.current.runDiscard();
    });
    expect(discard).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('discard?');
    expect(result.current.draft).toBe('restored');
    expect(result.current.dirty).toBe(false);
    expect(result.current.getLastSavedGen()).toBe(result.current.getEditGen());

    await act(async () => {
      await result.current.runPublish();
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(performSave).not.toHaveBeenCalled();
    expect(result.current.dirty).toBe(false);
    expect(result.current.saveState).toBe('saved');
  });
});

describe('useDraftPublishEditor async confirm (CHR-150)', () => {
  const stubAutosave = (): DraftPublishAutosave => ({
    save: async () => 'clean',
    setSaveState: () => {},
    setSaveError: () => {},
    getEditGen: () => 0,
    getLastSavedGen: () => 0,
    markClean: () => {},
    setAutosaveHeld: () => {},
    awaitInFlight: async () => 'clean',
  });

  const stubHold = (): DraftPublishHold => ({
    withHold: async (fn) => {
      await fn();
    },
    isBusy: () => false,
  });

  /** RN's `Alert` resolves on a later tick; a sync read would see a promise. */
  const deferredConfirm = (answer: boolean) =>
    vi.fn((_message: string) => Promise.resolve(answer));

  const renderEditor = (confirm: (message: string) => Promise<boolean>) => {
    const unpublish = vi.fn(async () => ({
      data: { version: 2, body: 'draft' } satisfies Entity,
      response: { status: 200 },
    }));
    const discard = vi.fn(async () => ({
      data: { version: 2, body: 'draft' } satisfies Entity,
      response: { status: 200 },
    }));
    const { result } = renderHook(() => {
      const versionRef = useRef(1);
      return useDraftPublishEditor({
        autosave: stubAutosave(),
        dirty: false,
        setDirty: () => {},
        versionRef,
        getVersion: (e: Entity) => e.version,
        onEntityMeta: () => {},
        onReplaceDraft: () => {},
        publish: async () => ({
          data: { version: 2, body: 'draft' },
          response: { status: 200 },
        }),
        unpublish,
        discard,
        unpublishConfirm: 'unpublish?',
        discardConfirm: 'discard?',
        confirm,
        hold: stubHold(),
      });
    });
    return { result, unpublish, discard };
  };

  test('awaits a deferred confirm before unpublishing or discarding', async () => {
    const confirm = deferredConfirm(true);
    const { result, unpublish, discard } = renderEditor(confirm);

    await act(async () => {
      await result.current.runUnpublish();
    });
    expect(confirm).toHaveBeenCalledWith('unpublish?');
    expect(unpublish).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.runDiscard();
    });
    expect(discard).toHaveBeenCalledTimes(1);
  });

  test('a rejected confirm cancels the mutation', async () => {
    const { result, unpublish, discard } = renderEditor(deferredConfirm(false));

    await act(async () => {
      await result.current.runUnpublish();
      await result.current.runDiscard();
    });
    expect(unpublish).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });
});

describe('useDraftPublishEditor discard awaits in-flight PUT (CHR-178)', () => {
  test('awaitInFlight resolves before discard mutate', async () => {
    const order: string[] = [];
    let releaseInFlight!: (value: 'clean') => void;
    const inFlight = new Promise<'clean'>((resolve) => {
      releaseInFlight = resolve;
    });
    const awaitInFlight = vi.fn(async () => {
      order.push('await');
      return inFlight;
    });
    const discard = vi.fn(async () => {
      order.push('discard');
      return {
        data: { version: 2, body: 'restored' } satisfies Entity,
        response: { status: 200 },
      };
    });

    const { result } = renderHook(() => {
      const versionRef = useRef(1);
      return useDraftPublishEditor({
        autosave: {
          save: async () => 'clean',
          setSaveState: () => {},
          setSaveError: () => {},
          getEditGen: () => 0,
          getLastSavedGen: () => 0,
          markClean: () => {},
          setAutosaveHeld: () => {},
          awaitInFlight,
        },
        dirty: false,
        setDirty: () => {},
        versionRef,
        getVersion: (e: Entity) => e.version,
        onEntityMeta: () => {},
        onReplaceDraft: () => {},
        publish: async () => ({
          data: { version: 1, body: 'x' },
          response: { status: 200 },
        }),
        unpublish: async () => ({
          data: { version: 1, body: 'x' },
          response: { status: 200 },
        }),
        discard,
        unpublishConfirm: 'u?',
        discardConfirm: 'd?',
        confirm: async () => true,
        hold: {
          withHold: async (fn) => {
            await fn();
          },
          isBusy: () => false,
        },
      });
    });

    let discardDone = false;
    const p = result.current.runDiscard().then(() => {
      discardDone = true;
    });
    // Confirm + withHold are async; flush to the awaitInFlight gate.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(awaitInFlight).toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    await act(async () => {
      releaseInFlight('clean');
      await p;
    });
    expect(discardDone).toBe(true);
    expect(order).toEqual(['await', 'discard']);
  });
});
