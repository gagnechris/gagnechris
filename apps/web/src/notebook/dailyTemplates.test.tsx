import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { DEFAULT_DAILY_TEMPLATES } from '@gagnechris/shared';
import { QueryClientTestProvider, testAuthUser } from '../test-utils';
import NotebookLayout from './NotebookLayout';
import NotebookTemplatesPage from './NotebookTemplatesPage';
import NotebookTodayPage from './NotebookTodayPage';
import { openDailyViaGet } from '../__tests__/fixtures/openDailyViaGet';

type Template = {
  area: 'work' | 'personal';
  bodyMarkdown: string;
  isDefault: boolean;
  version: number;
  updatedAt: string | null;
};

const state = vi.hoisted(() => ({
  dailyPuts: [] as Record<string, unknown>[],
  templatePuts: [] as Record<string, unknown>[],
  resets: 0,
  templates: {} as Record<string, Template>,
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

vi.mock('../kit/markdown/MarkdownPreview', () => ({
  default: ({ markdown }: { markdown: string }) => (
    <div data-testid="preview">{markdown}</div>
  ),
}));

const defaultTemplate = (area: 'work' | 'personal'): Template => ({
  area,
  bodyMarkdown: DEFAULT_DAILY_TEMPLATES[area],
  isDefault: true,
  version: 0,
  updatedAt: null,
});

const ok = (data: unknown) => ({
  data,
  error: undefined,
  response: { status: 200 },
});

vi.mock('../workspace/api/client', () => ({
  createApiClient: () =>
    openDailyViaGet({
      GET: async (
        path: string,
        init?: { params?: { path?: { area?: 'work' | 'personal' } } },
      ) => {
        const area = init?.params?.path?.area ?? 'work';
        if (path === '/api/notebook/notes/daily/{area}/{date}') {
          const template = state.templates[area] ?? defaultTemplate(area);
          return ok({
            exists: false,
            userId: 'u1',
            area,
            type: 'daily',
            date: '2026-10-16',
            title: '',
            bodyMarkdown: '',
            tags: [],
            pinned: false,
            version: 0,
            templateMarkdown: template.bodyMarkdown.replace(
              '{{weekday}}',
              'Friday',
            ),
          });
        }
        if (path === '/api/notebook/templates/daily/{area}') {
          return ok(state.templates[area] ?? defaultTemplate(area));
        }
        return ok({ items: [] });
      },
      PUT: async (
        path: string,
        init?: {
          body?: Record<string, unknown>;
          params?: { path?: { area?: 'work' | 'personal' } };
        },
      ) => {
        const body = init?.body ?? {};
        const area = init?.params?.path?.area ?? 'work';
        if (path === '/api/notebook/templates/daily/{area}') {
          state.templatePuts.push(body);
          const prev = state.templates[area] ?? defaultTemplate(area);
          state.templates[area] = {
            area,
            bodyMarkdown: String(body.bodyMarkdown),
            isDefault: false,
            version: prev.version + 1,
            updatedAt: '2026-10-16T12:00:00.000Z',
          };
          return ok(state.templates[area]);
        }
        state.dailyPuts.push(body);
        return ok({
          id: String(body.id),
          userId: 'u1',
          area,
          type: 'daily',
          date: '2026-10-16',
          title: '',
          bodyMarkdown: String(body.bodyMarkdown ?? ''),
          tags: [],
          pinned: false,
          taskIds: [],
          version: 1,
          createdAt: '2026-10-16T12:00:00.000Z',
          updatedAt: '2026-10-16T12:00:00.000Z',
          deleted: false,
        });
      },
      DELETE: async (
        _path: string,
        init?: { params?: { path?: { area?: 'work' | 'personal' } } },
      ) => {
        const area = init?.params?.path?.area ?? 'work';
        state.resets += 1;
        const prev = state.templates[area] ?? defaultTemplate(area);
        state.templates[area] = {
          ...defaultTemplate(area),
          version: prev.version + 1,
        };
        return ok(state.templates[area]);
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
          { path: 'today', element: <NotebookTodayPage /> },
          { path: 'settings/templates', element: <NotebookTemplatesPage /> },
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

const WORK_FILLED = DEFAULT_DAILY_TEMPLATES.work.replace(
  '{{weekday}}',
  'Friday',
);

describe('daily templates', () => {
  beforeEach(() => {
    state.dailyPuts = [];
    state.templatePuts = [];
    state.resets = 0;
    state.templates = {};
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('a new day starts from its template, unsaved, until the first edit', async () => {
    const user = userEvent.setup();
    renderAt('/today?date=2026-10-16&area=work');
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    expect(editor).toHaveValue(WORK_FILLED);
    expect(screen.getByRole('note')).toHaveTextContent(
      'Started from your Work template. It’s saved as soon as you type.',
    );
    expect(screen.getByRole('link', { name: 'Edit template' })).toHaveAttribute(
      'href',
      '/settings/templates?template=work&area=work',
    );
    expect(state.dailyPuts).toHaveLength(0);

    await user.type(editor, 'Ship it');
    await waitFor(() => expect(state.dailyPuts.length).toBeGreaterThan(0));
    expect(state.dailyPuts.at(-1)!.bodyMarkdown).toBe(`${WORK_FILLED}Ship it`);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  test('Start blank empties the day without saving it', async () => {
    const user = userEvent.setup();
    renderAt('/today?date=2026-10-16&area=personal');
    const editor = await screen.findByRole('textbox', { name: 'Note body' });
    expect(editor).toHaveValue(DEFAULT_DAILY_TEMPLATES.personal);
    await user.click(screen.getByRole('button', { name: 'Start blank' }));
    expect(editor).toHaveValue('');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(state.dailyPuts).toHaveLength(0);
  });

  test('the settings page saves checklists, refuses task lines and resets', async () => {
    const user = userEvent.setup();
    renderAt('/settings/templates?area=personal');
    const editor = await screen.findByRole('textbox', {
      name: 'Personal template',
    });
    expect(editor).toHaveValue(DEFAULT_DAILY_TEMPLATES.personal);
    expect(
      screen.getByRole('button', { name: 'Reset to default' }),
    ).toBeDisabled();

    await user.type(editor, '[[ ] call the bank');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Templates can’t hold tasks',
    );
    expect(state.templatePuts).toHaveLength(0);

    await user.clear(editor);
    await user.type(editor, '- [[ ] water plants');
    await waitFor(() =>
      expect(state.templatePuts.at(-1)?.bodyMarkdown).toBe(
        '- [ ] water plants',
      ),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const reset = screen.getByRole('button', { name: 'Reset to default' });
    await waitFor(() => expect(reset).toBeEnabled());
    await user.click(reset);
    await waitFor(() =>
      expect(editor).toHaveValue(DEFAULT_DAILY_TEMPLATES.personal),
    );
    expect(state.resets).toBe(1);
  });

  test('the Work / Personal switch defaults to the current area', async () => {
    const user = userEvent.setup();
    renderAt('/settings/templates?area=work');
    expect(
      await screen.findByRole('textbox', { name: 'Work template' }),
    ).toHaveValue(DEFAULT_DAILY_TEMPLATES.work);
    expect(screen.getByTestId('preview')).toHaveTextContent(
      /## Focus for Wednesday/,
    );
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Template' })).getByRole(
        'radio',
        { name: 'Personal' },
      ),
    );
    expect(
      await screen.findByRole('textbox', { name: 'Personal template' }),
    ).toBeInTheDocument();
  });
});
