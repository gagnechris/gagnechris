import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
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
  startDate: string | null;
  someday: boolean;
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
  created: [] as Record<string, unknown>[],
  failComplete: false,
}));

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (
      path: string,
      init?: {
        params?: {
          query?: {
            status?: string;
            open?: string;
            startOn?: string;
            someday?: string;
          };
        };
      },
    ) => {
      if (path === '/api/notebook/tasks') {
        // Honour the filters the UI sends, like the API.
        const q = init?.params?.query ?? {};
        return {
          data: {
            items: state.tasks.filter(
              (t) =>
                !t.deleted &&
                (q.status
                  ? t.status === q.status
                  : q.open !== 'true' || t.status !== 'done') &&
                (!q.startOn || t.startDate === q.startOn) &&
                (!q.someday || t.someday === (q.someday === 'true')),
            ),
          },
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
        state.created.push(body);
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
          startDate: (body.startDate as string | null | undefined) ?? null,
          someday: body.someday === true,
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
        if (state.failComplete) {
          return {
            data: undefined,
            error: { error: 'internal', message: 'boom' },
            response: { status: 500 },
          };
        }
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

describe('TodayTasksPanel', () => {
  beforeEach(() => {
    state.failComplete = false;
    state.created = [];
    state.tasks = [
      {
        id: '01ARZ3NDEKTSV4RRFFQ48JMTC5',
        userId: 'u1',
        area: 'work',
        title: 'Pay bills',
        description: '',
        priority: 'high',
        status: 'todo',
        dueDate: null,
        startDate: '2026-10-02',
        someday: false,
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

  test('lists tasks for today, completes, and shows tomorrow after 18:00', async () => {
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
    expect(screen.getByText('0/1 for today')).toBeInTheDocument();
    expect(screen.getByText(/Tomorrow \(2026-10-03\)/)).toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', { name: 'Complete Pay bills' }),
    );
    await waitFor(() => {
      expect(state.tasks[0]?.status).toBe('done');
    });
  });

  test('shows unscheduled tasks now and hides someday and later ones', async () => {
    const base = state.tasks[0]!;
    state.tasks = [
      {
        ...base,
        id: '01ARZ3NDEKTSV4RRFFQ48JMTD1',
        title: 'Now',
        startDate: null,
      },
      {
        ...base,
        id: '01ARZ3NDEKTSV4RRFFQ48JMTD2',
        title: 'Some day',
        startDate: null,
        someday: true,
      },
      {
        ...base,
        id: '01ARZ3NDEKTSV4RRFFQ48JMTD3',
        title: 'Next week',
        startDate: '2026-10-09',
      },
    ];

    render(
      <QueryClientTestProvider>
        <MemoryRouter>
          <TodayTasksPanel area="work" now={new Date(2026, 9, 2, 9, 0, 0)} />
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    expect(await screen.findByText('Now')).toBeInTheDocument();
    expect(screen.getByText('0/1 for today')).toBeInTheDocument();
    expect(screen.queryByText('Some day')).not.toBeInTheDocument();
    expect(screen.queryByText('Next week')).not.toBeInTheDocument();
  });

  test('a failed complete rolls back and shows an error', async () => {
    const user = userEvent.setup();
    state.failComplete = true;

    render(
      <QueryClientTestProvider>
        <MemoryRouter>
          <TodayTasksPanel area="work" now={new Date(2026, 9, 2, 9, 0, 0)} />
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    await user.click(
      await screen.findByRole('checkbox', { name: 'Complete Pay bills' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not complete “Pay bills”',
    );
    expect(
      screen.getByRole('checkbox', { name: 'Complete Pay bills' }),
    ).not.toBeChecked();
    expect(state.tasks[0]?.status).toBe('todo');
  });

  test('a lone day word asks for a title instead of doing nothing', async () => {
    const user = userEvent.setup();

    render(
      <QueryClientTestProvider>
        <MemoryRouter>
          <TodayTasksPanel area="work" now={new Date(2026, 9, 2, 9, 0, 0)} />
        </MemoryRouter>
      </QueryClientTestProvider>,
    );

    await user.type(
      await screen.findByRole('textbox', { name: 'Quick add task for today' }),
      'tomorrow{Enter}',
    );

    expect(
      await screen.findByText('Add a title before the date.'),
    ).toBeInTheDocument();
    expect(state.tasks).toHaveLength(1);
  });
});
