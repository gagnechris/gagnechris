import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { NoteTemplate } from '@gagnechris/app-core';
import {
  answerConfirms,
  QueryClientTestProvider,
  testAuthUser,
} from '../test-utils';
import NotebookLayout from './NotebookLayout';
import NotebookNoteTemplatesPage from './NotebookNoteTemplatesPage';

const TS = '2026-10-02T12:00:00.000Z';

const state = vi.hoisted(() => ({
  templates: [] as NoteTemplate[],
  posts: [] as Record<string, unknown>[],
  puts: [] as Record<string, unknown>[],
  deletes: [] as string[],
}));

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

type Init = {
  body?: Record<string, unknown>;
  params?: { path?: { id?: string } };
};

const ok = (data: unknown, status = 200) => ({
  data,
  error: undefined,
  response: { status },
});

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: async (path: string, init?: Init) => {
      if (path === '/api/notebook/templates/notes') {
        return ok({ items: state.templates });
      }
      if (path === '/api/notebook/templates/notes/{id}') {
        return ok(state.templates.find((t) => t.id === init?.params?.path?.id));
      }
      return ok({ items: [] });
    },
    POST: async (path: string, init?: Init) => {
      const body = init?.body ?? {};
      if (path === '/api/notebook/templates/notes') {
        state.posts.push(body);
        const created: NoteTemplate = {
          id: String(body.id),
          name: String(body.name),
          bodyMarkdown: String(body.bodyMarkdown ?? ''),
          version: 1,
          createdAt: TS,
          updatedAt: TS,
        };
        state.templates = [...state.templates, created];
        return ok(created, 201);
      }
      return ok({ items: [] });
    },
    PUT: async (_path: string, init?: Init) => {
      const body = init?.body ?? {};
      const id = init?.params?.path?.id;
      state.puts.push(body);
      const prev = state.templates.find((t) => t.id === id)!;
      const { version: _version, ...fields } = body;
      const next = { ...prev, ...fields, version: prev.version + 1 };
      state.templates = state.templates.map((t) => (t.id === id ? next : t));
      return ok(next);
    },
    DELETE: async (_path: string, init?: Init) => {
      const id = init?.params?.path?.id;
      state.deletes.push(String(id));
      state.templates = state.templates.filter((t) => t.id !== id);
      return { data: undefined, error: undefined, response: { status: 204 } };
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
            path: 'settings/note-templates',
            element: <NotebookNoteTemplatesPage />,
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

describe('note templates settings', () => {
  beforeEach(() => {
    state.templates = [];
    state.posts = [];
    state.puts = [];
    state.deletes = [];
    localStorage.clear();
  });

  test('creates a named template and saves its text and a rename', async () => {
    const user = userEvent.setup();
    const router = renderAt('/settings/note-templates');
    expect(
      await screen.findByRole('link', { name: 'Note templates' }),
    ).toHaveAttribute('aria-current', 'page');
    await screen.findByText('No templates yet');

    await user.type(
      screen.getByRole('textbox', { name: 'New template' }),
      'HM Screen Interview',
    );
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(state.posts).toEqual([
        expect.objectContaining({
          name: 'HM Screen Interview',
          bodyMarkdown: '',
        }),
      ]),
    );
    const id = String(state.posts[0]!.id);
    await waitFor(() =>
      expect(
        new URLSearchParams(router.state.location.search).get('template'),
      ).toBe(id),
    );

    const body = await screen.findByRole('textbox', { name: 'Template text' });
    await user.type(body, '## Questions{enter}[[ ] Send feedback');
    await waitFor(() =>
      expect(state.puts.at(-1)).toMatchObject({
        name: 'HM Screen Interview',
        bodyMarkdown: '## Questions\n[ ] Send feedback',
      }),
    );

    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    expect(screen.getByText('A template needs a name.')).toBeInTheDocument();
    await user.type(name, 'HM screen');
    await waitFor(() =>
      expect(state.puts.at(-1)).toMatchObject({ name: 'HM screen' }),
    );
    expect(state.puts.every((put) => put.name !== '')).toBe(true);
    expect(
      within(screen.getByRole('list', { name: 'Templates' })).getByRole(
        'button',
        { name: 'HM screen' },
      ),
    ).toHaveAttribute('aria-current', 'true');
  });

  test('lists templates by name and deletes one after confirming', async () => {
    state.templates = [
      {
        id: '01JTMPAAAAAAAAAAAAAAAAAAA1',
        name: 'Retro',
        bodyMarkdown: '',
        version: 1,
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: '01JTMPAAAAAAAAAAAAAAAAAAA2',
        name: '1:1',
        bodyMarkdown: '- Wins',
        version: 2,
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const confirm = answerConfirms(true);
    const user = userEvent.setup();
    renderAt('/settings/note-templates');
    const list = await screen.findByRole('list', { name: 'Templates' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['1:1', 'Retro']);
    const [oneOnOne, retro] = within(list).getAllByRole('listitem');
    expect(within(oneOnOne!).getByText('Wins')).toBeInTheDocument();
    expect(within(retro!).getByText('Empty')).toBeInTheDocument();

    await user.click(within(list).getByRole('button', { name: '1:1' }));
    expect(
      await screen.findByRole('textbox', { name: 'Template text' }),
    ).toHaveValue('- Wins');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(state.deletes).toEqual(['01JTMPAAAAAAAAAAAAAAAAAAA2']),
    );
    expect(confirm).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Templates' }))
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Retro']),
    );
    expect(screen.getByText('Choose a template')).toBeInTheDocument();
  });

  test('text with a task embed shows why and is not saved until the embed goes', async () => {
    state.templates = [
      {
        id: '01JTMPAAAAAAAAAAAAAAAAAAA1',
        name: 'Retro',
        bodyMarkdown: '- Wins',
        version: 1,
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const user = userEvent.setup();
    renderAt('/settings/note-templates?template=01JTMPAAAAAAAAAAAAAAAAAAA1');
    const body = await screen.findByRole('textbox', { name: 'Template text' });

    await user.clear(body);
    await user.paste('- Wins\n{{task:01ARZ3NDEKTSV4RRFFQ48JMCZC}}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Templates can’t hold task rows',
    );
    expect(body).toHaveValue('- Wins\n{{task:01ARZ3NDEKTSV4RRFFQ48JMCZC}}');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(
      state.puts.some((put) => String(put.bodyMarkdown).includes('{{task:')),
    ).toBe(false);

    await user.clear(body);
    await user.type(body, '- Wins and blockers');
    await waitFor(() =>
      expect(state.puts.at(-1)).toMatchObject({
        bodyMarkdown: '- Wins and blockers',
      }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
