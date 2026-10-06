import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import NotebookSearchPalette from './NotebookSearchPalette';

const server = vi.hoisted(() => ({
  searches: [] as Record<string, unknown>[],
  completed: [] as string[],
  gets: [] as string[],
  status: 'todo',
}));

const task = {
  id: 't1',
  userId: 'u1',
  area: 'work',
  title: 'Prep standup',
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
  createdAt: '2026-10-01T14:00:00.000Z',
  updatedAt: '2026-10-01T14:00:00.000Z',
  deleted: false,
};

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string) => {
      server.gets.push(path);
      return {
        data: { ...task, status: server.status },
        error: undefined,
        response: { status: 200 },
      };
    },
    POST: async (path: string, init?: { body?: Record<string, unknown> }) => {
      if (path.endsWith('/complete')) {
        server.completed.push(path);
        server.status = 'done';
        return {
          data: { ...task, status: 'done', version: 2 },
          error: undefined,
          response: { status: 200 },
        };
      }
      server.searches.push(init?.body ?? {});
      return searchResponse;
    },
  }),
}));

const searchResponse = vi.hoisted(() => ({
  data: {
    notes: [
      {
        type: 'note',
        id: 'n1',
        area: 'work',
        title: 'Standup notes',
        snippet: 'standup with team',
        matches: [{ start: 0, end: 7 }],
      },
      {
        type: 'note',
        id: 'n2',
        area: 'work',
        title: 'Saturday, September 19',
        date: '2026-09-19',
        snippet: 'after standup',
        matches: [{ start: 6, end: 13 }],
      },
    ],
    tasks: [
      {
        type: 'task',
        id: 't1',
        area: 'work',
        title: 'Prep standup',
        status: 'todo',
        version: 1,
        snippet: 'Prep standup',
        matches: [{ start: 5, end: 12 }],
      },
    ],
  },
  error: undefined,
  response: { status: 200 },
}));

const TodayProbe = () => <p>Today {useLocation().search}</p>;

const renderPalette = () =>
  render(
    <QueryClientTestProvider>
      <MemoryRouter initialEntries={['/notes']}>
        <Routes>
          <Route
            path="/notes"
            element={
              <NotebookSearchPalette onClose={() => {}} areaFilter="work" />
            }
          />
          <Route path="/tasks/:id" element={<p>Task page</p>} />
          <Route path="/today" element={<TodayProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientTestProvider>,
  );

describe('NotebookSearchPalette', () => {
  test('is a labelled combobox whose active option is tracked by aria-activedescendant', async () => {
    const user = userEvent.setup();
    renderPalette();
    const input = screen.getByRole('combobox', {
      name: 'Search notes and tasks',
    });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    await user.type(input, 'standup');
    const listbox = await screen.findByRole('listbox', { name: 'Results' });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);

    const groups = within(listbox).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-labelledby'))).toHaveLength(
      2,
    );
    expect(within(groups[0]!).getAllByRole('option')).toHaveLength(2);
    expect(
      within(screen.getByRole('group', { name: 'Tasks · 1' })).getByRole(
        'option',
        {
          name: /Prep standup/,
        },
      ),
    ).toBeInTheDocument();
    expect(within(listbox).queryByRole('heading')).toBeNull();
    expect(within(listbox).queryByRole('list')).toBeNull();
    for (const option of within(listbox).getAllByRole('option')) {
      expect(option.tagName).not.toBe('BUTTON');
    }

    const first = within(listbox).getByRole('option', {
      name: /Standup notes/,
    });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', first.id);

    await user.keyboard('{ArrowDown}{ArrowDown}');
    const task = within(listbox).getByRole('option', { name: /Prep standup/ });
    expect(task).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', task.id);
    expect(input).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(await screen.findByText('Task page')).toBeInTheDocument();
  });

  test('waits for a pause in typing before searching', async () => {
    const user = userEvent.setup();
    renderPalette();
    server.searches.length = 0;
    await user.type(
      screen.getByRole('combobox', { name: 'Search notes and tasks' }),
      'daily 19',
    );
    await screen.findByRole('listbox', { name: 'Results' });
    expect(server.searches).toEqual([
      { q: 'daily 19', area: 'work', limit: 12 },
    ]);
  });

  test('a daily note hit opens Today on its day and area', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(
      screen.getByRole('combobox', { name: 'Search notes and tasks' }),
      'standup',
    );
    await user.click(
      await screen.findByRole('option', { name: /Saturday, September 19/ }),
    );
    expect(
      await screen.findByText('Today ?date=2026-09-19&area=work'),
    ).toBeInTheDocument();
  });

  test('This area / All areas is a radio group that rescopes the search', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(
      screen.getByRole('combobox', { name: 'Search notes and tasks' }),
      'standup',
    );
    await screen.findByRole('listbox', { name: 'Results' });
    expect(server.searches[server.searches.length - 1]).toMatchObject({
      area: 'work',
    });

    const scope = screen.getByRole('radiogroup', { name: 'Search scope' });
    const thisArea = within(scope).getByRole('radio', { name: 'This area' });
    expect(thisArea).toHaveAttribute('aria-checked', 'true');
    thisArea.focus();
    await user.keyboard('{ArrowRight}');
    const all = within(scope).getByRole('radio', { name: 'All areas' });
    expect(all).toHaveAttribute('aria-checked', 'true');
    expect(all).toHaveFocus();
    await screen.findAllByText('work');
    expect(server.searches[server.searches.length - 1]?.area).toBeUndefined();
  });

  test('a task hit is checkable, and ⌘⏎ checks off the selected one, with no task reads', async () => {
    server.gets = [];
    const user = userEvent.setup();
    renderPalette();
    const input = screen.getByRole('combobox', {
      name: 'Search notes and tasks',
    });
    await user.type(input, 'standup');
    const option = await screen.findByRole('option', {
      name: /^Prep standup, open/,
    });
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(option).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(
      await screen.findByRole('option', { name: /^Prep standup, done/ }),
    ).toBeInTheDocument();
    expect(server.completed).toEqual(['/api/notebook/tasks/{id}/complete']);
    expect(
      within(option).getByRole('checkbox', { hidden: true }),
    ).toBeChecked();
    // The hit carries status and version; the palette reads no task.
    expect(server.gets).toEqual([]);
  });
});
