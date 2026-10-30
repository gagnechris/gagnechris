import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createMemoryRouter,
  RouterProvider,
  useOutletContext,
} from 'react-router-dom';
import {
  answerConfirms,
  QueryClientTestProvider,
  testAuthUser,
} from '../test-utils';
import NotebookLayout, { type NotebookOutletContext } from './NotebookLayout';
import NotebookAreasPage from './NotebookAreasPage';

type Area = { id: string; name: string };

const state = vi.hoisted(() => ({
  areas: [] as { id: string; name: string }[],
  version: 0,
  puts: [] as { version: number; areas: { id: string; name: string }[] }[],
  refuse: null as string | null,
}));

const ok = (data: unknown, status = 200) => ({
  data,
  error: undefined,
  response: { status },
});

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string) =>
      path === '/api/notebook/areas'
        ? ok({ areas: state.areas, version: state.version, updatedAt: null })
        : ok({ items: [] }),
    PUT: async (
      path: string,
      init: { body: { version: number; areas: Area[] } },
    ) => {
      if (path !== '/api/notebook/areas') return ok({});
      state.puts.push(init.body);
      if (state.refuse) {
        return {
          data: undefined,
          error: { error: 'conflict', message: state.refuse },
          response: { status: 409 },
        };
      }
      state.areas = init.body.areas;
      state.version += 1;
      return ok({
        areas: state.areas,
        version: state.version,
        updatedAt: null,
      });
    },
  }),
}));

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <NotebookLayout user={testAuthUser} />,
        children: [
          {
            path: 'settings/areas',
            element: (
              <>
                <AreasProbe />
                <NotebookAreasPage />
              </>
            ),
          },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
  return router;
}

/** What the area chip on every page offers and shows. */
const AreasProbe = () => {
  const { areas, areaName } = useOutletContext<NotebookOutletContext>();
  return (
    <>
      <p data-testid="areas">{areas.map((a) => a.name).join(',')}</p>
      <p data-testid="area">{areaName}</p>
    </>
  );
};

const switchNames = () => screen.getByTestId('areas').textContent?.split(',');

describe('Settings > Areas', () => {
  beforeEach(() => {
    state.areas = [
      { id: 'work', name: 'Work' },
      { id: 'personal', name: 'Personal' },
    ];
    state.version = 0;
    state.puts = [];
    state.refuse = null;
    localStorage.clear();
  });

  test('adds a third area, which the switch shows at once', async () => {
    const user = userEvent.setup();
    renderAt('/settings/areas');
    expect(await screen.findByRole('link', { name: 'Areas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await screen.findByRole('list', { name: 'Areas' });

    await user.type(
      screen.getByRole('textbox', { name: 'New area' }),
      'Family',
    );
    await user.click(screen.getByRole('button', { name: 'Add area' }));

    await waitFor(() =>
      expect(switchNames()).toEqual(['Work', 'Personal', 'Family']),
    );
    expect(state.puts).toEqual([
      {
        version: 0,
        areas: [
          { id: 'work', name: 'Work' },
          { id: 'personal', name: 'Personal' },
          { id: 'family', name: 'Family' },
        ],
      },
    ]);
    expect(screen.getByRole('textbox', { name: 'New area' })).toHaveValue('');
  });

  test('a fifth area can’t be added', async () => {
    state.areas = [
      { id: 'work', name: 'Work' },
      { id: 'personal', name: 'Personal' },
      { id: 'family', name: 'Family' },
      { id: 'health', name: 'Health' },
    ];
    renderAt('/settings/areas');
    const input = await screen.findByRole('textbox', { name: /New area/ });
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add area' })).toBeDisabled();
    expect(screen.getByText(/You can have up to 4 areas/)).toBeInTheDocument();
  });

  test('renames an area under the same id, and reorders it', async () => {
    const user = userEvent.setup();
    renderAt('/settings/areas?area=personal');
    const name = await screen.findByRole('textbox', { name: 'Area 2' });
    await user.clear(name);
    await user.type(name, 'Home{Enter}');
    await waitFor(() => expect(switchNames()).toEqual(['Work', 'Home']));
    expect(state.puts.at(-1)?.areas).toEqual([
      { id: 'work', name: 'Work' },
      { id: 'personal', name: 'Home' },
    ]);
    expect(screen.getByTestId('area')).toHaveTextContent('Home');

    const puts = state.puts.length;
    screen.getByRole('button', { name: 'Reorder Home' }).focus();
    await user.keyboard(' {ArrowUp}');
    expect(state.puts).toHaveLength(puts);
    await user.keyboard(' ');
    await waitFor(() => expect(switchNames()).toEqual(['Home', 'Work']));
    expect(state.puts).toHaveLength(puts + 1);
    expect(state.puts.at(-1)).toEqual({
      version: 1,
      areas: [
        { id: 'personal', name: 'Home' },
        { id: 'work', name: 'Work' },
      ],
    });
  });

  test('a blank or repeated name isn’t saved', async () => {
    const user = userEvent.setup();
    renderAt('/settings/areas');
    const name = await screen.findByRole('textbox', { name: /Area 2/ });
    await user.clear(name);
    await user.tab();
    expect(screen.getByText('An area needs a name.')).toBeInTheDocument();
    await user.type(name, 'work');
    await user.tab();
    expect(screen.getByText('Another area has this name.')).toBeInTheDocument();
    expect(state.puts).toEqual([]);
  });

  test('removing asks first and shows why the API refused', async () => {
    state.areas = [...state.areas, { id: 'family', name: 'Family' }];
    state.refuse =
      'Family still has notes or tasks. Move or delete them before removing it.';
    const confirm = answerConfirms(true);
    const user = userEvent.setup();
    renderAt('/settings/areas');
    await screen.findByRole('list', { name: 'Areas' });

    await user.click(screen.getByRole('button', { name: 'Remove Family' }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringMatching(/^Remove Family\?/),
      'Remove',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Family still has notes or tasks.',
    );
    expect(state.puts.at(-1)?.areas.map((a) => a.id)).toEqual([
      'work',
      'personal',
    ]);
    expect(switchNames()).toEqual(['Work', 'Personal', 'Family']);
  });
});
