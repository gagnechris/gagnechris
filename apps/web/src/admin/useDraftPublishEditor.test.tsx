import { act, renderHook } from '@testing-library/react';
import { useRef, useState, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { useDraftPublishEditor } from './useDraftPublishEditor';
import { useQueuedAutosave } from './useQueuedAutosave';

type Entity = { version: number; body: string };

function DataRouter({ children }: { children: ReactNode }) {
  const router = createMemoryRouter([{ path: '/', element: <>{children}</> }], {
    initialEntries: ['/'],
  });
  return <RouterProvider router={router} />;
}

describe('useDraftPublishEditor discard then publish (CHR-145)', () => {
  test('edit → discard → publish leaves clean with no extra save', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
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

    const { result } = renderHook(
      () => {
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
        });
        return {
          ...autosave,
          ...editor,
          dirty,
          draft,
          setDraft,
          setDirty,
        };
      },
      { wrapper: DataRouter },
    );

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

    confirm.mockRestore();
  });
});
