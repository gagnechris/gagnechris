import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import { openDailyViaGet } from '../__tests__/fixtures/openDailyViaGet';
import { TodayEditor } from './TodayEditor';

const EMBED_A = '01TESTTASK0000000000000001';
const EMBED_B = '01TESTTASK0000000000000002';

vi.mock('../kit/markdown/MarkdownEditor', () => ({
  default: ({
    value,
    onChange,
    label = 'Markdown',
  }: {
    value: string;
    onChange: (value: string) => void;
    label?: string;
  }) => (
    <textarea
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('../workspace/api/client', () => ({
  createApiClient: () =>
    openDailyViaGet({
      GET: async (path: string) =>
        path === '/api/notebook/notes/daily/{area}/{date}'
          ? {
              data: {
                id: '01TESTDAILYNOTE000000000001',
                userId: 'u1',
                area: 'work',
                type: 'daily',
                date: '2026-10-02',
                title: '',
                bodyMarkdown: `{{task:${EMBED_B}}}\n\n{{task:${EMBED_A}}}\n\n`,
                tags: [],
                pinned: false,
                version: 1,
                createdAt: '2026-10-02T00:00:00.000Z',
                updatedAt: '2026-10-02T00:00:00.000Z',
                deleted: false,
              },
              error: undefined,
              response: { status: 200 },
            }
          : {
              data: { items: [] },
              error: undefined,
              response: { status: 200 },
            },
      PUT: async () => new Promise(() => {}),
    }),
}));

function Editor({ onEmbeddedIds }: { onEmbeddedIds: (ids: unknown) => void }) {
  const appendEmbedRef = useRef<((taskId: string) => void) | null>(null);
  return (
    <TodayEditor
      area="work"
      date="2026-10-02"
      today="2026-10-02"
      onUnsavedChange={() => {}}
      onEmbeddedIds={onEmbeddedIds}
      appendEmbedRef={appendEmbedRef}
      onNoteReady={() => {}}
      highlightTaskId={null}
      onHighlighted={() => {}}
      onDeleted={() => {}}
    />
  );
}

describe('TodayEditor', () => {
  test('reports embed ids again only when the set of embeds changes', async () => {
    const onEmbeddedIds = vi.fn();
    const user = userEvent.setup();
    const router = createMemoryRouter([
      { path: '/', element: <Editor onEmbeddedIds={onEmbeddedIds} /> },
    ]);
    render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    await waitFor(() =>
      expect(onEmbeddedIds).toHaveBeenLastCalledWith(
        new Set([EMBED_A, EMBED_B]),
      ),
    );
    const reports = onEmbeddedIds.mock.calls.length;

    await user.type(editor, 'context under the tasks');
    expect(onEmbeddedIds).toHaveBeenCalledTimes(reports);

    await user.clear(editor);
    await user.paste(`{{task:${EMBED_A}}}`);
    expect(onEmbeddedIds).toHaveBeenLastCalledWith(new Set([EMBED_A]));
  });
});
