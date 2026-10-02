import { describe, expect, test, vi } from 'vitest';
import {
  useDraftPublishEditor,
  type DraftPublishAutosave,
} from '../src/useDraftPublishEditor.js';
import { useQueuedAutosave } from '../src/useQueuedAutosave.js';
import { act, renderHook, useState } from './renderHook.js';
import { useRef } from 'react';

type Entity = { version: number; body: string };

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

  /** RN's `Alert` resolves on a later tick; a sync read would see a promise. */
  const deferredConfirm = (answer: boolean) =>
    vi.fn(
      (_message: string) =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(answer), 0);
        }),
    );

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
