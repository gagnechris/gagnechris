import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import { QueryClientTestProvider, testAuthUser } from '../test-utils';
import NotebookLayout, { type NotebookOutletContext } from './NotebookLayout';
import {
  NOTEBOOK_AREA_STORAGE_KEY,
  writeStoredNotebookArea,
} from './notebookAreaPreference';

const { taskQueries, areaList } = vi.hoisted(() => ({
  taskQueries: [] as Record<string, unknown>[],
  areaList: {
    areas: [] as { id: string; name: string }[],
    version: 0,
    updatedAt: null,
  },
}));

const DEFAULT_AREAS = [
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
];

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (
      path: string,
      init?: { params: { query: Record<string, unknown> } },
    ) => {
      if (path === '/api/notebook/areas') {
        return { data: areaList, error: undefined, response: { status: 200 } };
      }
      taskQueries.push(init?.params.query ?? {});
      return {
        data: {
          items: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
          nextCursor: undefined,
        },
        error: undefined,
        response: { status: 200 },
      };
    },
  }),
}));

function sectionFromPath(pathname: string): string {
  if (pathname.startsWith('/tasks')) return 'Tasks';
  if (pathname.startsWith('/notes')) return 'Notes';
  if (pathname.startsWith('/today')) return 'Today';
  return 'Notebook';
}

/** Echoes the outlet context so tests can assert what the layout provides. */
const NotebookOutletProbe = () => {
  const { areaName } = useOutletContext<NotebookOutletContext>();
  const { id } = useParams<{ id?: string }>();
  const { pathname, search } = useLocation();
  const section = sectionFromPath(pathname);
  const areaLabel = areaName;

  return (
    <section className="workspace-panel">
      <h1>{section}</h1>
      <p className="workspace-panel__lede">
        {id
          ? `${areaLabel} · note ${id} (editor arrives in a later ticket).`
          : `${areaLabel} · ${section.toLowerCase()} UI arrives in a later ticket.`}
      </p>
      <p data-testid="location">{`${pathname}${search}`}</p>
    </section>
  );
};

function renderNotebook(initialPath = '/today') {
  return render(
    <QueryClientTestProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<NotebookLayout user={testAuthUser} />}>
            <Route index element={<Navigate to="today" replace />} />
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

describe('NotebookLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    taskQueries.length = 0;
    areaList.areas = DEFAULT_AREAS;
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('shows the area switcher with only the user’s areas and Today / Notes / All tasks in the Notebook nav', async () => {
    renderNotebook();

    const switcher = screen.getByRole('radiogroup', { name: 'Notebook area' });
    expect(
      within(switcher)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Work', 'Personal']);
    expect(screen.getByRole('radio', { name: 'Work' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Personal' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(
      screen.queryByRole('radio', { name: /^All/ }),
    ).not.toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Notebook' });
    const today = await within(nav).findByRole('link', {
      name: 'Today, 3 open',
    });
    expect(today).toHaveAttribute('href', '/today?area=work');
    expect(today).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Notes' })).toHaveAttribute(
      'href',
      '/notes?area=work',
    );
    expect(
      within(nav).getByRole('link', { name: 'All tasks' }),
    ).toHaveAttribute('href', '/tasks?area=work');
    expect(
      within(nav).queryByRole('link', { name: /Posts|Resume/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Search everything' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText(/Work · today UI/i)).toBeInTheDocument();
    expect(taskQueries[0]).toMatchObject({ area: 'work' });
  });

  test('⌘K opens search from any page', async () => {
    const user = userEvent.setup();
    renderNotebook('/notes');

    await user.keyboard('{Meta>}k{/Meta}');
    expect(
      await screen.findByRole('combobox', { name: 'Search notes and tasks' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('combobox', { name: 'Search notes and tasks' }),
    ).not.toBeInTheDocument();
  });

  test('navigates between Today, Notes, and Tasks', async () => {
    const user = userEvent.setup();
    renderNotebook();

    await user.click(screen.getByRole('link', { name: 'Notes' }));
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'All tasks' }));
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /^Today/ }));
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
    renderNotebook('/tasks');

    expect(screen.getByRole('radio', { name: 'Personal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/Personal · tasks UI/i)).toBeInTheDocument();
  });

  test('a stored All falls back to the first area', async () => {
    writeStoredNotebookArea('all');
    renderNotebook('/notes');

    expect(await screen.findByRole('radio', { name: 'Work' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/notes?area=work',
      ),
    );
    await waitFor(() =>
      expect(localStorage.getItem(NOTEBOOK_AREA_STORAGE_KEY)).toBe('work'),
    );
  });

  test('shows a third area from the list, in its order, and switches to it', async () => {
    areaList.areas = [
      { id: 'work', name: 'Work' },
      { id: 'family', name: 'Family' },
      { id: 'personal', name: 'Home' },
    ];
    const user = userEvent.setup();
    renderNotebook('/today?area=family');

    const switcher = await screen.findByRole('radiogroup', {
      name: 'Notebook area',
    });
    expect(
      within(switcher)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Work', 'Family', 'Home']);
    expect(screen.getByRole('radio', { name: 'Family' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText(/Family · today UI/i)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/today?area=family',
    );

    await user.click(screen.getByRole('radio', { name: 'Home' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/today?area=personal',
    );
    expect(screen.getByText(/Home · today UI/i)).toBeInTheDocument();
  });

  test('an area that was removed falls back to the first one', async () => {
    areaList.areas = [{ id: 'personal', name: 'Personal' }];
    renderNotebook('/tasks?area=work');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/tasks?area=personal',
      ),
    );
  });

  test('Settings links to Areas', () => {
    renderNotebook();
    expect(screen.getByRole('link', { name: 'Areas' })).toHaveAttribute(
      'href',
      '/settings/areas?area=work',
    );
  });

  test('notes/:id still shows Notes section chrome', () => {
    renderNotebook('/notes/01TESTNOTEID00000000000000');

    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(
      screen.getByText(/Work · note 01TESTNOTEID00000000000000/i),
    ).toBeInTheDocument();
  });

  test('the area in the URL wins over the stored one and becomes the stored one', () => {
    writeStoredNotebookArea('work');
    renderNotebook('/notes?area=personal');

    expect(screen.getByRole('radio', { name: 'Personal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(localStorage.getItem(NOTEBOOK_AREA_STORAGE_KEY)).toBe('personal');
  });

  test('a link without an area gets the stored one, keeping other params', async () => {
    writeStoredNotebookArea('personal');
    renderNotebook('/tasks?show=today');

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/tasks?show=today&area=personal',
    );
  });

  test('arrow keys move the area and the URL follows', async () => {
    const user = userEvent.setup();
    renderNotebook();

    screen.getByRole('radio', { name: 'Work' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Personal' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Personal' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/today?area=personal',
    );
  });

  test('opening the root lands on Today with the area', async () => {
    renderNotebook('/');

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/today?area=work',
    );
  });
});
