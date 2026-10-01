import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DraftPublishEditorOptions } from '@gagnechris/app-core';
import { useDraftPublishEditor } from './useDraftPublishEditor';

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
    useDraftPublishEditor: () => ({
      busy: false,
      saveRef: { current: saveMock },
      publishRef: { current: publishMock },
      suppressLeaveGuardRef: { current: false },
      runPublish: vi.fn(),
      runUnpublish: vi.fn(),
      runDiscard: vi.fn(),
      runDelete: vi.fn(),
    }),
  };
});

const baseOptions = {
  autosave: {
    save: vi.fn(async (): Promise<'clean'> => 'clean'),
    setSaveState: vi.fn(),
    setSaveError: vi.fn(),
    getEditGen: () => 0,
    getLastSavedGen: () => 0,
    markClean: vi.fn(),
    setAutosaveHeld: vi.fn(),
  },
  dirty: false,
  setDirty: vi.fn(),
  versionRef: { current: 1 },
  getVersion: () => 1,
  onEntityMeta: vi.fn(),
  onReplaceDraft: vi.fn(),
  publish: vi.fn(async () => ({
    data: {},
    response: { status: 200 },
  })),
  unpublish: vi.fn(async () => ({
    data: {},
    response: { status: 200 },
  })),
  discard: vi.fn(async () => ({
    data: {},
    response: { status: 200 },
  })),
  unpublishConfirm: 'unpublish?',
  discardConfirm: 'discard?',
} satisfies Omit<DraftPublishEditorOptions<object>, 'confirm'>;

describe('useDraftPublishEditor shortcuts (CHR-148)', () => {
  beforeEach(() => {
    publishMock.mockClear();
    saveMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('⌘⏎ outside the editor publishes', () => {
    renderHook(() => useDraftPublishEditor(baseOptions));

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      }),
    );
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  test('⌘⏎ inside CodeMirror does not publish', () => {
    const cm = document.createElement('div');
    cm.className = 'cm-editor';
    const inner = document.createElement('div');
    cm.appendChild(inner);
    document.body.appendChild(cm);

    renderHook(() => useDraftPublishEditor(baseOptions));

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

  test('⌘S saves when not busy', () => {
    renderHook(() => useDraftPublishEditor(baseOptions));
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
