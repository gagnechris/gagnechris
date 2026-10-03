import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import { QueryClientTestProvider } from '../test-utils';
import AdminNotebookLayout, {
  type NotebookOutletContext,
} from './AdminNotebookLayout';
import {
  NOTEBOOK_AREA_STORAGE_KEY,
  writeNotebookAreaFilter,
  type NotebookAreaFilter,
} from './notebook/notebookAreaPreference';

const AREA_LABELS: Record<NotebookAreaFilter, string> = {
  work: 'Work',
  personal: 'Personal',
  all: 'All areas',
};

function sectionFromPath(pathname: string): string {
  if (pathname.includes('/notebook/tasks')) return 'Tasks';
  if (pathname.includes('/notebook/notes')) return 'Notes';
  if (pathname.includes('/notebook/today')) return 'Today';
  return 'Notebook';
}

/** Echoes the outlet context so tests can assert what the layout provides. */
const NotebookOutletProbe = () => {
  const { areaFilter } = useOutletContext<NotebookOutletContext>();
  const { id } = useParams<{ id?: string }>();
  const { pathname } = useLocation();
  const section = sectionFromPath(pathname);
  const areaLabel = AREA_LABELS[areaFilter];

  return (
    <section className="admin-panel">
      <h1>{section}</h1>
      <p className="admin-panel__lede">
        {id
          ? `${areaLabel} · note ${id} (editor arrives in a later ticket).`
          : `${areaLabel} · ${section.toLowerCase()} UI arrives in a later ticket.`}
      </p>
    </section>
  );
};

function renderNotebook(initialPath = '/admin/notebook/today') {
  return render(
    <QueryClientTestProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/admin/notebook" element={<AdminNotebookLayout />}>
            <Route path="today" element={<NotebookOutletProbe />} />
            <Route path="notes" element={<NotebookOutletProbe />} />
            <Route path="notes/:id" element={<NotebookOutletProbe />} />
            <Route path="tasks" element={<NotebookOutletProbe />} />
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
