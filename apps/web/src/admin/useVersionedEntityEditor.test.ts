import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { VersionedEntityEditorOptions } from '@gagnechris/app-core';
import { useVersionedEntityEditor } from './useVersionedEntityEditor';

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom',
    );
  return {
    ...actual,
    useBlocker: () => ({ state: 'unblocked' as const }),
  };
});

const publishMock = vi.fn();
const saveMock = vi.fn();

vi.mock('@gagnechris/app-core', async () => {
  const actual = await vi.importActual<typeof import('@gagnechris/app-core')>(
    '@gagnechris/app-core',
  );
  return {
    ...actual,
    useVersionedEntityEditor: () => ({
      busy: false,
      saveRef: { current: saveMock },
      publishRef: { current: publishMock },
      suppressLeaveGuardRef: { current: false },
      dirty: false,
      draft: {},
      setDraft: vi.fn(),
      updateDraft: vi.fn(),
      entity: null,
      setDirty: vi.fn(),
      save: vi.fn(),
      saveState: 'idle' as const,
      saveError: null,
      setSaveError: vi.fn(),
      loadError: null,
      isLoading: false,
      actionBarProps: {} as never,
      runPublish: vi.fn(),
      runUnpublish: vi.fn(),
      runDiscard: vi.fn(),
      runDelete: vi.fn(),
      bumpEdit: vi.fn(),
      versionRef: { current: 1 },
    }),
  };
});

type Entity = {
  version: number;
  status: 'draft' | 'published' | 'deleted';
  hasUnpublishedChanges: boolean;
};

type Draft = Record<string, never>;
type Params = Record<string, never>;

const baseOptions = {
  resource: {} as VersionedEntityEditorOptions<
    Entity,
    Draft,
    Params
  >['resource'],
  params: {},
  initialDraft: {},
  toDraft: () => ({}),
  getEntityId: () => 'id',
  toPayload: () => ({}),
  conflictMessage: 'conflict',
  unpublishConfirm: 'unpublish?',
  discardConfirm: 'discard?',
} satisfies Omit<VersionedEntityEditorOptions<Entity, Draft, Params>, 'confirm'>;

describe('useVersionedEntityEditor shortcuts (CHR-148 / CHR-165)', () => {
  beforeEach(() => {
    publishMock.mockClear();
    saveMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('⌘⏎ outside the editor publishes and preventDefault blocks a newline', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    renderHook(() => useVersionedEntityEditor(baseOptions));

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    input.remove();
  });

  test('⌘⏎ inside CodeMirror does not publish', () => {
    const cm = document.createElement('div');
    cm.className = 'cm-editor';
    const inner = document.createElement('div');
    cm.appendChild(inner);
    document.body.appendChild(cm);

    renderHook(() => useVersionedEntityEditor(baseOptions));

    inner.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      }),
    );
    expect(publishMock).not.toHaveBeenCalled();
    cm.remove();
  });

  test('⌘⏎ in the editor does not also insert a newline (handler skips preventDefault)', () => {
    const cm = document.createElement('div');
    cm.className = 'cm-editor';
    const inner = document.createElement('div');
    cm.appendChild(inner);
    document.body.appendChild(cm);

    renderHook(() => useVersionedEntityEditor(baseOptions));

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    inner.dispatchEvent(event);
    expect(publishMock).not.toHaveBeenCalled();
    // Live shell must not steal the keystroke from CodeMirror.
    expect(event.defaultPrevented).toBe(false);
    cm.remove();
  });

  test('⌘S saves when not busy', () => {
    renderHook(() => useVersionedEntityEditor(baseOptions));
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 's',
        metaKey: true,
        bubbles: true,
      }),
    );
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});
