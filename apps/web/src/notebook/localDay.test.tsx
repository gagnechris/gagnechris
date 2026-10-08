import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Outlet, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { bucketTodayTasks, type Task } from '@gagnechris/shared';
import { QueryClientTestProvider } from '../test-utils';
import { NotebookCalendar } from './NotebookCalendar';
import NotebookTasksPage from './NotebookTasksPage';
import { useNotebookExport } from './useNotebookExport';

// Evenings here are already the next day in UTC.
process.env.TZ = 'America/Los_Angeles';

const api = vi.hoisted(() => ({ taskQueries: [] as Record<string, string>[] }));
const download = vi.hoisted(() => ({ names: [] as string[] }));

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (
      path: string,
      init?: { params?: { query?: Record<string, string> } },
    ) => {
      if (path === '/api/notebook/tasks') {
        api.taskQueries.push(init?.params?.query ?? {});
      }
      return { data: { items: [] }, response: { status: 200 } };
    },
  }),
}));

vi.mock('./exportNotebook', () => ({
  buildNotebookExportZip: () => ({ blob: new Blob([]) }),
  triggerBlobDownload: (_blob: Blob, name: string) => {
    download.names.push(name);
  },
}));

afterEach(() => {
  vi.useRealTimers();
  api.taskQueries = [];
  download.names = [];
});

const task = (overrides: Partial<Task> & Pick<Task, 'id'>): Task => ({
  userId: 'u1',
  area: 'work',
  title: overrides.id,
  description: '',
  priority: 'med',
  status: 'todo',
  dueDate: null,
  startDate: null,
  someday: false,
  completedAt: null,
  noteId: null,
  tags: [],
  version: 1,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  deleted: false,
  ...overrides,
});

describe('Notebook days are local days', () => {
  test('Still open orders an unscheduled task by the local day it was created', () => {
    const scheduled = task({ id: 'x2', startDate: '2026-10-01' });
    // 8pm on Oct 1 in Los Angeles, already Oct 2 in UTC.
    const added = task({ id: 'x1', createdAt: '2026-10-02T03:00:00.000Z' });
    const { stillOpen } = bucketTodayTasks([scheduled, added], {
      day: '2026-10-02',
      embeddedIds: new Set(),
    });
    expect(stillOpen.map((t) => t.id)).toEqual(['x1', 'x2']);
  });

  test('an evening export is named for the local day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 21, 0));
    const { result } = renderHook(() => useNotebookExport(), {
      wrapper: QueryClientTestProvider,
    });
    await act(() => result.current.exportZip());
    expect(download.names).toEqual(['notebook-export-2026-10-06.zip']);
  });

  test('the calendar moves its today mark at local midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 23, 59, 30));
    render(
      <NotebookCalendar
        selected="2026-10-20"
        markedDates={new Set()}
        onSelect={() => {}}
      />,
    );
    const todayCell = () =>
      document.querySelector('.notebook-calendar__cell--today');
    expect(todayCell()).toBe(
      screen.getByRole('gridcell', { name: /October 20, 2026/ }),
    );

    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(todayCell()).toBe(
      screen.getByRole('gridcell', { name: /October 21, 2026/ }),
    );
  });

  test('the Tasks page asks for the new day after local midnight', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 20, 23, 59, 30));
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Outlet context={{ areaFilter: 'work' }} />,
          children: [{ path: 'tasks', element: <NotebookTasksPage /> }],
        },
      ],
      { initialEntries: ['/tasks'] },
    );
    render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );
    await vi.waitFor(() =>
      expect(api.taskQueries.map((q) => q.today)).toContain('2026-10-20'),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    await vi.waitFor(() =>
      expect(api.taskQueries.map((q) => q.today)).toContain('2026-10-21'),
    );
  });
});
