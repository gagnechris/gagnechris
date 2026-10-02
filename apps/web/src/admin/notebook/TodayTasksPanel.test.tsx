import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientTestProvider } from '../../test-utils';
import TodayTasksPanel from './TodayTasksPanel';

type Task = {
  id: string;
  userId: string;
  area: 'work' | 'personal';
  title: string;
  description: string;
  priority: 'low' | 'med' | 'high';
  status: 'todo' | 'in_progress' | 'done';
  dueDate: string | null;
  completedAt: string | null;
  noteId: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
};

const state = vi.hoisted(() => ({
  tasks: [] as Task[],
}));

vi.mock('../../api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string) => {
      if (path === '/api/notebook/tasks') {
        return {
          data: { items: state.tasks.filter((t) => !t.deleted) },
          error: undefined,
          response: { status: 200 },
        };
      }
      return {
        data: undefined,
        error: { error: 'not_found' },
        response: { status: 404 },
      };
    },
    POST: async (
      path: string,
      init?: {
        body?: Record<string, unknown>;
        params?: { path?: { id?: string } };
      },
    ) => {
      if (path === '/api/notebook/tasks') {
        const body = init?.body ?? {};
        const now = '2026-10-02T12:00:00.000Z';
        const task: Task = {
          id: String(body.id),
          userId: 'u1',
          area: (body.area as Task['area']) ?? 'work',
          title: String(body.title),
          description: '',
          priority: (body.priority as Task['priority']) ?? 'med',
          status: 'todo',
          dueDate: (body.dueDate as string | null | undefined) ?? null,
          completedAt: null,
          noteId: null,
          tags: [],
          version: 1,
          createdAt: now,
          updatedAt: now,
          deleted: false,
        };
        state.tasks.push(task);
        return { data: task, error: undefined, response: { status: 201 } };
      }
      if (path === '/api/notebook/tasks/{id}/complete') {
        const id = init?.params?.path?.id;
        const task = state.tasks.find((t) => t.id === id);
        if (!task) {
          return {
            data: undefined,
            error: { error: 'not_found' },
            response: { status: 404 },
          };
        }
        task.status = 'done';
        task.completedAt = '2026-10-02T12:00:00.000Z';
        task.version += 1;
        return {
          data: { ...task },
          error: undefined,
          response: { status: 200 },
        };
      }
      return {
        data: undefined,
        error: { error: 'not_found' },
        response: { status: 404 },
      };
    },
  }),
}));

describe('TodayTasksPanel (CHR-45)', () => {
  beforeEach(() => {
    state.tasks = [
      {
        id: '01ARZ3NDEKTSV4RRFFQ48JMTC5',
        userId: 'u1',
        area: 'work',
        title: 'Pay bills',
        description: '',
        priority: 'high',
        status: 'todo',
        dueDate: '2026-10-02',
        completedAt: null,
        noteId: null,
        tags: [],
        version: 1,
        createdAt: '2026-10-02T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
        deleted: false,
      },
    ];
  });

  test('lists due today, completes, and shows tomorrow after 18:00', async () => {
    const user = userEvent.setup();
    const evening = new Date(2026, 9, 2, 19, 0, 0);

    render(
      <QueryClientTestProvider>
        <MemoryRouter>
          <TodayTasksPanel area="work" now={evening} />
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    expect(await screen.findByText('Pay bills')).toBeInTheDocument();
    expect(screen.getByText('0/1 due today')).toBeInTheDocument();
    expect(screen.getByText(/Tomorrow \(2026-10-03\)/)).toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', { name: 'Complete Pay bills' }),
    );
    await waitFor(() => {
      expect(state.tasks[0]?.status).toBe('done');
    });
  });
});
