import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import AdminNotebookLayout from './AdminNotebookLayout';
import AdminNotebookPage from './AdminNotebookPage';
import {
  NOTEBOOK_AREA_STORAGE_KEY,
  writeNotebookAreaFilter,
} from './notebook/notebookAreaPreference';

function renderNotebook(initialPath = '/admin/notebook/today') {
  return render(
    <QueryClientTestProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/admin/notebook" element={<AdminNotebookLayout />}>
            <Route path="today" element={<AdminNotebookPage />} />
            <Route path="notes" element={<AdminNotebookPage />} />
            <Route path="notes/:id" element={<AdminNotebookPage />} />
            <Route path="tasks" element={<AdminNotebookPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientTestProvider>,
  );
}

describe('AdminNotebookLayout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('shows area switcher and Today / Notes / Tasks links', () => {
    renderNotebook();

    expect(
      screen.getByRole('radiogroup', { name: 'Notebook area' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Work' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Personal' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    const sections = screen.getByRole('navigation', {
      name: 'Notebook sections',
    });
    expect(sections).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute(
      'href',
      '/admin/notebook/today',
    );
    expect(screen.getByRole('link', { name: 'Notes' })).toHaveAttribute(
      'href',
      '/admin/notebook/notes',
    );
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute(
      'href',
      '/admin/notebook/tasks',
    );
    expect(screen.getByRole('button', { name: /Search/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText(/Work · today UI/i)).toBeInTheDocument();
  });

  test('navigates between Today, Notes, and Tasks', async () => {
    const user = userEvent.setup();
    renderNotebook();

    await user.click(screen.getByRole('link', { name: 'Notes' }));
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Tasks' }));
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
  });

  test('area preference persists across remounts', async () => {
    const user = userEvent.setup();
    const { unmount } = renderNotebook();

    await user.click(screen.getByRole('radio', { name: 'Personal' }));
    expect(screen.getByRole('radio', { name: 'Personal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(localStorage.getItem(NOTEBOOK_AREA_STORAGE_KEY)).toBe('personal');
    expect(screen.getByText(/Personal · today UI/i)).toBeInTheDocument();

    unmount();
    renderNotebook('/admin/notebook/tasks');

    expect(screen.getByRole('radio', { name: 'Personal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/Personal · tasks UI/i)).toBeInTheDocument();
  });

  test('reads stored All filter on first mount', () => {
    writeNotebookAreaFilter('all');
    renderNotebook('/admin/notebook/notes');

    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/All areas · notes UI/i)).toBeInTheDocument();
  });

  test('notes/:id still shows Notes section chrome', () => {
    renderNotebook('/admin/notebook/notes/01TESTNOTEID00000000000000');

    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(
      screen.getByText(/Work · note 01TESTNOTEID00000000000000/i),
    ).toBeInTheDocument();
  });
});
