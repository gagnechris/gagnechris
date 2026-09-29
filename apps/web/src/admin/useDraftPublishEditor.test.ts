import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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

vi.mock('@gagnechris/app-core', async () => {
  const actual = await vi.importActual<typeof import('@gagnechris/app-core')>(
    '@gagnechris/app-core',
  );
  return {
    ...actual,
    useDraftPublishEditor: (options: {
      confirm: (message: string) => boolean;
    }) => {
      void options;
      return {
        busy: false,
        setBusy: vi.fn(),
        saveRef: { current: vi.fn() },
        publishRef: { current: publishMock },
        runPublish: vi.fn(),
        runUnpublish: vi.fn(),
        runDiscard: vi.fn(),
      };
    },
  };
});

const publishMock = vi.fn();

describe('useDraftPublishEditor shortcuts (CHR-148)', () => {
  beforeEach(() => {
    publishMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('⌘⏎ outside the editor publishes', () => {
    renderHook(() =>
      useDraftPublishEditor({
        autosave: {} as never,
        dirty: false,
        setDirty: vi.fn(),
        versionRef: { current: 1 },
        getVersion: () => 1,
        onEntityMeta: vi.fn(),
        onReplaceDraft: vi.fn(),
        publish: vi.fn(),
        unpublish: vi.fn(),
        discard: vi.fn(),
      }),
    );

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

    renderHook(() =>
      useDraftPublishEditor({
        autosave: {} as never,
        dirty: false,
        setDirty: vi.fn(),
        versionRef: { current: 1 },
        getVersion: () => 1,
        onEntityMeta: vi.fn(),
        onReplaceDraft: vi.fn(),
        publish: vi.fn(),
        unpublish: vi.fn(),
        discard: vi.fn(),
      }),
    );

    inner.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
        bubbles: true,
      }),
    );
    // Window listener sees the bubbled event with target inside .cm-editor.
    expect(publishMock).not.toHaveBeenCalled();
    cm.remove();
  });
});
