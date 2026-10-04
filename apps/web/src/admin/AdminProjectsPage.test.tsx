import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Project } from '@gagnechris/app-core';
import { QueryClientTestProvider } from '../test-utils';
import AdminProjectsPage from './AdminProjectsPage';

const get = vi.fn();
const post = vi.fn();

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
  }),
}));

const project = (over: Partial<Project>): Project => ({
  id: '01P',
  slug: 'p',
  name: 'P',
  pitch: '',
  stage: 'idea',
  stageNote: '',
  previewImage: null,
  bodyMarkdown: '',
  stack: [],
  links: [],
  demo: null,
  order: 0,
  href: null,
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-10-04T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
  ...over,
});

const ok = (data: unknown, status = 200) => ({
  data,
  error: undefined,
  response: { status },
});

const listed = (items: Project[]) => ok({ items });

function renderPage() {
  render(
    <QueryClientTestProvider>
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/projects" element={<AdminProjectsPage />} />
          <Route path="/projects/:id" element={<p>Editor</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientTestProvider>,
  );
}

describe('AdminProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('lists projects by order with their stage, publish status and page', async () => {
    get.mockResolvedValue(
      listed([
        project({
          id: '01B',
          name: 'Bears',
          slug: 'dont-feed-the-bears',
          stage: 'live',
          order: 3,
          href: '/dont-feed-the-bears',
          status: 'published',
        }),
        project({
          id: '01N',
          name: 'Notebook',
          slug: 'notebook',
          stage: 'building',
          order: 2,
          bodyMarkdown: 'Why',
          hasUnpublishedChanges: true,
          status: 'published',
        }),
        project({ id: '01I', name: 'Someday', slug: 'someday', order: 9 }),
      ]),
    );
    renderPage();

    const links = await screen.findAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/projects/01N',
      '/projects/01B',
      '/projects/01I',
    ]);
    const notebook = within(links[0]!);
    expect(notebook.getByText('Notebook')).toBeInTheDocument();
    expect(notebook.getByText('Building')).toBeInTheDocument();
    expect(notebook.getByText('published')).toBeInTheDocument();
    expect(notebook.getByText('Unpublished changes')).toBeInTheDocument();
    expect(notebook.getByText('/projects/notebook')).toBeInTheDocument();
    expect(
      within(links[1]!).getByText('→ /dont-feed-the-bears'),
    ).toBeInTheDocument();
    expect(within(links[2]!).getByText('no page')).toBeInTheDocument();
    expect(within(links[2]!).getByText('draft')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create starter projects' }),
    ).not.toBeInTheDocument();
  });

  test('New project creates a draft with a unique placeholder slug, after the last order, and opens it', async () => {
    const user = userEvent.setup();
    get.mockResolvedValue(listed([project({ id: '01A', order: 4 })]));
    post.mockResolvedValue(ok(project({ id: '01NEW' }), 201));
    renderPage();
    await screen.findByText('P');

    await user.click(screen.getByRole('button', { name: 'New project' }));
    await screen.findByText('Editor');
    expect(post).toHaveBeenCalledWith('/api/admin/projects', {
      body: expect.objectContaining({
        name: 'Untitled project',
        slug: expect.stringMatching(/^untitled-project-[a-z0-9]+$/),
        order: 5,
      }),
    });
  });

  test('the empty state creates the three starter drafts once', async () => {
    const user = userEvent.setup();
    let items: Project[] = [];
    get.mockImplementation(async () => listed(items));
    post.mockImplementation(
      async (_path: string, init: { body: Partial<Project> }) => {
        const created = project({
          ...init.body,
          id: `01${init.body.slug}`,
        });
        items = [...items, created];
        return ok(created, 201);
      },
    );
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Create starter projects' }),
    );

    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3));
    expect(
      post.mock.calls.map((c) => (c[1] as { body: Project }).body),
    ).toEqual([
      expect.objectContaining({ slug: 'posts', stage: 'live', order: 1 }),
      expect.objectContaining({
        slug: 'notebook',
        stage: 'building',
        order: 2,
      }),
      expect.objectContaining({
        slug: 'dont-feed-the-bears',
        stage: 'live',
        order: 3,
        href: '/dont-feed-the-bears',
      }),
    ]);
    expect(screen.getAllByText('draft')).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: 'Create starter projects' }),
    ).not.toBeInTheDocument();
  });

  test('starter creation re-reads the list, so a project created elsewhere is skipped', async () => {
    const user = userEvent.setup();
    const elsewhere = project({ id: '01X', slug: 'notebook' });
    get
      .mockResolvedValueOnce(listed([]))
      .mockResolvedValue(listed([elsewhere]));
    post.mockImplementation(async (_path: string, init: { body: Project }) =>
      ok(project({ ...init.body, id: `01${init.body.slug}` }), 201),
    );
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Create starter projects' }),
    );
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(
      post.mock.calls.map((c) => (c[1] as { body: Project }).body.slug),
    ).toEqual(['posts', 'dont-feed-the-bears']);
  });
});
