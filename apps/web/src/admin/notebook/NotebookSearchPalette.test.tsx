import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientTestProvider } from '../../test-utils';
import NotebookSearchPalette from './NotebookSearchPalette';

vi.mock('../../api/client', () => ({
  createApiClient: () => ({
    POST: async () => ({
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
            title: 'Retro',
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
            snippet: 'Prep standup',
            matches: [{ start: 5, end: 12 }],
          },
        ],
      },
      error: undefined,
      response: { status: 200 },
    }),
  }),
}));

const renderPalette = () =>
  render(
    <QueryClientTestProvider>
      <MemoryRouter initialEntries={['/admin/notebook/today']}>
        <Routes>
          <Route
            path="/admin/notebook/today"
            element={
              <NotebookSearchPalette
                open
                onClose={() => {}}
                areaFilter="work"
              />
            }
          />
          <Route path="/admin/notebook/tasks/:id" element={<p>Task page</p>} />
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
      within(screen.getByRole('group', { name: 'Tasks' })).getByRole('option', {
        name: /Prep standup/,
      }),
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
});
