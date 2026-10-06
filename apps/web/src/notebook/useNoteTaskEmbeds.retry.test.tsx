import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { TaskEmbedCreate } from '../kit/markdown/taskEmbeds';
import { QueryClientTestProvider } from '../test-utils';
import { useNoteTaskEmbeds } from './useNoteTaskEmbeds';

const TASK_ID = '01JTASKAAAAAAAAAAAAAAAAAAA';
const NOTE = { id: '01JNOTEAAAAAAAAAAAAAAAAAAA', area: 'work' as const };

const api = vi.hoisted(() => ({
  posts: 0,
  /** Responses for successive task POSTs; the last one repeats. */
  responses: [] as { status: number; body: Record<string, unknown> }[],
}));

const captured = vi.hoisted(() => ({
  onCreate: null as null | ((create: TaskEmbedCreate) => void),
}));

vi.mock('../kit/markdown/taskEmbeds', () => ({
  useTaskEmbedEditor: ({
    onCreate,
  }: {
    onCreate: (create: TaskEmbedCreate) => void;
  }) => {
    captured.onCreate = onCreate;
    return { extensions: [], portals: null };
  },
}));

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async () => ({ data: { items: [] }, response: { status: 200 } }),
    POST: async (path: string, init?: { body?: Record<string, unknown> }) => {
      if (path !== '/api/notebook/tasks') throw new Error(`unexpected ${path}`);
      const next =
        api.responses[Math.min(api.posts, api.responses.length - 1)]!;
      api.posts += 1;
      if (next.status < 300) {
        return {
          data: { ...init?.body, version: 1, deleted: false },
          response: { status: next.status },
        };
      }
      return { error: next.body, response: { status: next.status } };
    },
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientTestProvider>{children}</QueryClientTestProvider>
);

const draft = {
  title: 'Call Sam',
  priority: 'med' as const,
  startDate: null,
  someday: false,
  dueDate: null,
};

const NOTE_NOT_SAVED = {
  status: 400,
  body: {
    error: 'bad_request',
    message: 'noteId must reference an existing note',
    fields: { noteId: 'not_found' },
  },
};

function setup() {
  const ensureNoteSaved = vi.fn(async () => {});
  const hook = renderHook(
    () =>
      useNoteTaskEmbeds({
        markdown: '',
        note: NOTE,
        ensureNoteSaved,
      }),
    { wrapper },
  );
  act(() => captured.onCreate!({ id: TASK_ID, draft }));
  const embed = () => render(<>{hook.result.current.renderEmbed!(TASK_ID)}</>);
  return { ensureNoteSaved, embed };
}

beforeEach(() => {
  vi.useFakeTimers();
  api.posts = 0;
  api.responses = [];
  captured.onCreate = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('embedded task create retries', () => {
  test('a validation 400 fails at once without saving the note or retrying', async () => {
    api.responses = [
      {
        status: 400,
        body: {
          error: 'bad_request',
          message: 'Validation failed',
          fields: { title: 'too_big' },
        },
      },
    ];
    const { ensureNoteSaved, embed } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(api.posts).toBe(1);
    expect(ensureNoteSaved).not.toHaveBeenCalled();
    embed();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Call Sam · couldn’t save this task',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(api.posts).toBe(1);
  });

  test('a 400 without field errors is not retried', async () => {
    api.responses = [
      { status: 400, body: { error: 'bad_request', message: 'Bad request' } },
    ];
    const { ensureNoteSaved } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(api.posts).toBe(1);
    expect(ensureNoteSaved).not.toHaveBeenCalled();
  });

  test('a note that is not saved yet is saved, then the create is retried', async () => {
    api.responses = [NOTE_NOT_SAVED, NOTE_NOT_SAVED, { status: 201, body: {} }];
    const { ensureNoteSaved, embed } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.posts).toBe(1);
    expect(ensureNoteSaved).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(api.posts).toBe(2);
    expect(ensureNoteSaved).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(api.posts).toBe(3);
    embed();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
