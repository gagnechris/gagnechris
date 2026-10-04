import { act, renderHook, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import { resumeResource } from '@gagnechris/app-core';
import { QueryClientTestProvider } from '../test-utils';
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

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();

vi.mock('./api/client', () => ({
  createApiClient: () => ({
    GET: (...args: unknown[]) => get(...args),
    PUT: (...args: unknown[]) => put(...args),
    POST: (...args: unknown[]) => post(...args),
  }),
}));

const resume = {
  ...DEFAULT_RESUME,
  status: 'draft' as const,
  publishedAt: null,
  updatedAt: '2026-09-27T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: true,
};

function renderEditor(beforePublish: () => boolean | string) {
  return renderHook(
    () =>
      useVersionedEntityEditor({
        resource: resumeResource,
        params: {},
        initialDraft: { name: '' },
        toDraft: (entity) => ({ name: entity.name }),
        getEntityId: () => 'resume',
        toPayload: (draft, entity) => ({
          name: draft.name,
          pdfPath: entity.pdfPath,
          content: entity.content,
        }),
        conflictMessage: 'conflict',
        unpublishConfirm: 'unpublish?',
        discardConfirm: 'discard?',
        beforePublish,
      }),
    { wrapper: QueryClientTestProvider },
  );
}

const pressModEnter = () =>
  fireEvent.keyDown(window, { key: 'Enter', metaKey: true });

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('useVersionedEntityEditor beforePublish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: structuredClone(resume),
      error: undefined,
      response: { status: 200 },
    });
    put.mockImplementation((_path: string, { body }: { body: object }) =>
      Promise.resolve({
        data: { ...resume, ...body, version: 2 },
        error: undefined,
        response: { status: 200 },
      }),
    );
    post.mockResolvedValue({
      data: { ...resume, status: 'published', hasUnpublishedChanges: false },
      error: undefined,
      response: { status: 200 },
    });
  });

  test.each([
    ['false', false, null],
    ['a message', 'Fix the dates first.', 'Fix the dates first.'],
  ] as const)(
    'returning %s blocks the Publish button and ⌘⏎ before any save',
    async (_label, verdict, shownError) => {
      const beforePublish = vi.fn(() => verdict);
      const { result } = renderEditor(beforePublish);
      await waitFor(() => expect(result.current.entity).not.toBeNull());

      act(() => {
        result.current.updateDraft((prev) => ({ ...prev, name: 'Edited' }));
      });

      act(() => {
        result.current.actionBarProps.onPublish();
      });
      await act(settle);
      expect(beforePublish).toHaveBeenCalledTimes(1);
      expect(result.current.saveError).toBe(shownError);

      act(() => {
        result.current.setSaveError(null);
      });
      act(() => {
        pressModEnter();
      });
      await act(settle);
      expect(beforePublish).toHaveBeenCalledTimes(2);
      expect(result.current.saveError).toBe(shownError);

      expect(put).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
    },
  );

  test('returning true saves pending edits and publishes from both paths', async () => {
    const beforePublish = vi.fn(() => true);
    const { result } = renderEditor(beforePublish);
    await waitFor(() => expect(result.current.entity).not.toBeNull());

    act(() => {
      result.current.updateDraft((prev) => ({ ...prev, name: 'Edited' }));
    });
    act(() => {
      result.current.actionBarProps.onPublish();
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.busy).toBe(false));

    act(() => {
      pressModEnter();
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(beforePublish).toHaveBeenCalledTimes(2);
    expect(result.current.saveError).toBeNull();
  });
});
