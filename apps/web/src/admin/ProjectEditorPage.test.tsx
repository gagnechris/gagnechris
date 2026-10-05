import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Project } from '@gagnechris/app-core';
import { EVERY_MARKDOWN_ELEMENT } from '@gagnechris/shared/fixtures/every-markdown-element';
import {
  projectPageView,
  renderProjectPageBodyHtml,
} from '@gagnechris/shared/render';
import { QueryClientTestProvider } from '../test-utils';
import ProjectEditorPage from './ProjectEditorPage';

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();

vi.mock('../workspace/api/client', () => ({
  createApiClient: () => ({
    GET: (...args: unknown[]) => get(...args),
    PUT: (...args: unknown[]) => put(...args),
    POST: (...args: unknown[]) => post(...args),
    DELETE: (...args: unknown[]) => del(...args),
  }),
}));

vi.mock('../kit/markdown/MarkdownEditor', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="Markdown"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('../kit/markdown/MarkdownPreview', () => ({
  default: () => <div data-testid="preview" />,
}));

const PROJECT_ID = '01TESTPROJECTID00000000000';

const baseProject: Project = {
  id: PROJECT_ID,
  slug: 'notebook',
  name: 'Notebook',
  pitch: 'Daily notes and tasks.',
  stage: 'building',
  stageNote: '',
  previewImage: null,
  bodyMarkdown: 'Why',
  stack: ['React'],
  links: [{ label: 'Repo', url: 'https://github.com/gagnechris' }],
  demo: null,
  order: 2,
  href: null,
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-10-04T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

const ok = (data: unknown) => ({
  data,
  error: undefined,
  response: { status: 200 },
});

type PutInit = {
  params: { path: { id: string } };
  body: Record<string, unknown>;
};

const lastPutBody = () =>
  (put.mock.calls[put.mock.calls.length - 1]?.[1] as PutInit | undefined)?.body;

function renderEditor(project: Project = baseProject) {
  get.mockResolvedValue(ok(project));
  put.mockImplementation(async (_path: string, init: PutInit) =>
    ok({
      ...project,
      ...init.body,
      version: (init.body.version as number) + 1,
    }),
  );
  const router = createMemoryRouter(
    [
      { path: '/projects/:projectId', element: <ProjectEditorPage /> },
      { path: '/projects', element: <p>Projects list</p> },
    ],
    { initialEntries: [`/projects/${project.id}`] },
  );
  render(
    <QueryClientTestProvider>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
  return router;
}

const save = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(put).toHaveBeenCalled());
};

describe('ProjectEditorPage fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('saves every field through PUT /api/admin/projects/{id}', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByDisplayValue('Notebook');

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Notebook app');
    await user.clear(screen.getByLabelText('Pitch', { exact: false }));
    await user.type(
      screen.getByLabelText('Pitch', { exact: false }),
      'Notes and tasks',
    );
    await user.click(screen.getByRole('radio', { name: 'Live' }));
    await user.type(
      screen.getByLabelText('Stage note', { exact: false }),
      'since 2026',
    );
    await user.selectOptions(screen.getByLabelText('Demo'), 'notebook');
    await user.clear(screen.getByLabelText('Order', { exact: false }));
    await user.type(screen.getByLabelText('Order', { exact: false }), '5');
    await user.type(screen.getByLabelText('Markdown'), ' and how');
    await save(user);

    expect(put).toHaveBeenLastCalledWith('/api/admin/projects/{id}', {
      params: { path: { id: PROJECT_ID } },
      body: {
        version: 1,
        name: 'Notebook app',
        // A hydrated real slug stays put when the name changes.
        slug: 'notebook',
        pitch: 'Notes and tasks',
        stage: 'live',
        stageNote: 'since 2026',
        previewImage: null,
        bodyMarkdown: 'Why and how',
        stack: ['React'],
        links: [{ label: 'Repo', url: 'https://github.com/gagnechris' }],
        demo: 'notebook',
        order: 5,
        href: null,
      },
    });
  });

  test('a new project’s placeholder slug follows the name, and the slug preview shows the page path', async () => {
    const user = userEvent.setup();
    renderEditor({
      ...baseProject,
      name: 'Untitled project',
      slug: 'untitled-project-a1b2c3',
    });
    await screen.findByDisplayValue('Untitled project');

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Side Quest');
    expect(screen.getByLabelText('Slug', { exact: false })).toHaveValue(
      'side-quest',
    );
    expect(screen.getByText('/projects/side-quest')).toBeInTheDocument();
    await save(user);
    expect(lastPutBody()).toMatchObject({
      name: 'Side Quest',
      slug: 'side-quest',
    });
  });

  test('stack chips: Enter and commas add, duplicates are skipped, × removes', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByDisplayValue('Notebook');

    const input = screen.getByLabelText('Stack');
    await user.type(input, 'DynamoDB{Enter}');
    await user.type(input, 'react, Vite,');
    const chips = within(screen.getByRole('list', { name: 'Stack items' }));
    expect(chips.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'React×',
      'DynamoDB×',
      'Vite×',
    ]);
    await user.click(screen.getByRole('button', { name: 'Remove React' }));
    await save(user);
    expect(lastPutBody()).toMatchObject({ stack: ['DynamoDB', 'Vite'] });
  });

  test('links use the schema’s URL rules: an invalid URL shows an error and the saved links are kept', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByDisplayValue('Notebook');

    await user.click(screen.getByRole('button', { name: 'Add link' }));
    const labels = screen.getAllByLabelText('Label');
    const urls = screen.getAllByLabelText('URL');
    await user.type(labels[1]!, 'Demo');
    await user.type(urls[1]!, 'javascript:alert(1)');
    expect(
      screen.getByText(
        'Must be a site-relative path or an http, https, mailto or tel URL',
      ),
    ).toBeInTheDocument();
    await save(user);
    expect(lastPutBody()).toMatchObject({
      links: [{ label: 'Repo', url: 'https://github.com/gagnechris' }],
    });

    await user.clear(urls[1]!);
    await user.type(urls[1]!, '/notebook');
    expect(
      screen.queryByText(/Must be a site-relative path/),
    ).not.toBeInTheDocument();
    await save(user);
    expect(lastPutBody()).toMatchObject({
      links: [
        { label: 'Repo', url: 'https://github.com/gagnechris' },
        { label: 'Demo', url: '/notebook' },
      ],
    });
  });

  test('a link with a URL but no label asks for a label', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByDisplayValue('Notebook');
    await user.clear(screen.getAllByLabelText('Label')[0]!);
    expect(screen.getByText('Add a label')).toBeInTheDocument();
  });

  test('href: "Link card to…" replaces the project page and must be a site path or https', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByDisplayValue('Notebook');

    expect(screen.getByText(/replaces the project page/)).toBeInTheDocument();
    const href = screen.getByLabelText('Link card to…', { exact: false });

    await user.type(href, 'http://example.com');
    expect(
      screen.getByText('Must be a site-relative path or an https URL'),
    ).toBeInTheDocument();
    await save(user);
    expect(lastPutBody()).toMatchObject({ href: null });

    await user.clear(href);
    await user.type(href, '/dont-feed-the-bears');
    expect(
      screen.getByText(/No project page: the card links to/),
    ).toBeInTheDocument();
    await save(user);
    expect(lastPutBody()).toMatchObject({ href: '/dont-feed-the-bears' });
  });

  test('Publish is blocked while a field is invalid', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByDisplayValue('Notebook');
    await user.type(
      screen.getByLabelText('Link card to…', { exact: false }),
      '//evil.example',
    );
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(
      await screen.findByText(
        'Not published: fix the highlighted fields first.',
      ),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('ProjectEditorPage preview image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('uploads through the presigned /media path and shows the image', async () => {
    const user = userEvent.setup();
    const putUpload = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', putUpload);
    post.mockImplementation(async (path: string) =>
      path === '/api/admin/media/upload-url'
        ? ok({
            uploadUrl: 'https://bucket.test/media/2026/10/x.png?sig=1',
            publicPath: '/media/2026/10/x.png',
            headers: { 'Content-Type': 'image/png' },
            expiresAt: '2026-10-04T01:00:00.000Z',
          })
        : ok(baseProject),
    );
    renderEditor();
    await screen.findByDisplayValue('Notebook');

    const file = new File(['png'], 'preview.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Upload preview image'), file);

    expect(
      await screen.findByRole('img', { name: 'Preview image' }),
    ).toHaveAttribute('src', '/media/2026/10/x.png');
    expect(post).toHaveBeenCalledWith('/api/admin/media/upload-url', {
      body: {
        contentType: 'image/png',
        contentLength: 3,
        filename: 'preview.png',
      },
    });
    expect(putUpload).toHaveBeenCalledWith(
      'https://bucket.test/media/2026/10/x.png?sig=1',
      expect.objectContaining({ method: 'PUT', body: file }),
    );
    await save(user);
    expect(lastPutBody()).toMatchObject({
      previewImage: '/media/2026/10/x.png',
    });

    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(
      screen.queryByRole('img', { name: 'Preview image' }),
    ).not.toBeInTheDocument();
    await save(user);
    expect(lastPutBody()).toMatchObject({ previewImage: null });
  });

  test('shows a saved preview image on load', async () => {
    renderEditor({ ...baseProject, previewImage: '/media/2026/10/saved.webp' });
    expect(
      await screen.findByRole('img', { name: 'Preview image' }),
    ).toHaveAttribute('src', '/media/2026/10/saved.webp');
  });

  test('a rejected upload shows the error and keeps the old image', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({
      data: undefined,
      error: { error: 'bad_request' },
      response: { status: 400 },
    });
    renderEditor();
    await screen.findByDisplayValue('Notebook');
    await user.upload(
      screen.getByLabelText('Upload preview image'),
      new File(['png'], 'preview.png', { type: 'image/png' }),
    );
    expect(
      await screen.findByText(/Image upload rejected \(400\)/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Preview image' }),
    ).not.toBeInTheDocument();
  });
});

describe('ProjectEditorPage demo without a preview image', () => {
  const HINT =
    'Add a preview image: a project with a demo needs one to publish.';
  const BLOCKED = 'Not published: fix the highlighted fields first.';
  const publishCalls = () =>
    post.mock.calls.filter(([path]) => String(path).endsWith('/{id}/publish'));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('shows the hint and blocks Publish and Mod-Enter until an image is added', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    post.mockImplementation(async (path: string) =>
      path === '/api/admin/media/upload-url'
        ? ok({
            uploadUrl: 'https://bucket.test/media/2026/10/x.png?sig=1',
            publicPath: '/media/2026/10/x.png',
            headers: { 'Content-Type': 'image/png' },
            expiresAt: '2026-10-04T01:00:00.000Z',
          })
        : ok({ ...baseProject, status: 'published', version: 2 }),
    );
    renderEditor();
    await screen.findByDisplayValue('Notebook');
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Demo'), 'notebook');
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(
      screen.getByLabelText('Upload preview image'),
    ).toHaveAccessibleDescription(HINT);
    await save(user);
    expect(lastPutBody()).toMatchObject({
      demo: 'notebook',
      previewImage: null,
    });

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(publishCalls()).toHaveLength(0);

    await user.upload(
      screen.getByLabelText('Upload preview image'),
      new File(['png'], 'preview.png', { type: 'image/png' }),
    );
    await screen.findByRole('img', { name: 'Preview image' });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(screen.queryByText(BLOCKED)).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(publishCalls()).toHaveLength(1));
  });

  test('clearing the demo unblocks Publish', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue(
      ok({ ...baseProject, status: 'published', version: 2 }),
    );
    renderEditor({ ...baseProject, demo: 'posts' });
    await screen.findByDisplayValue('Notebook');
    expect(screen.getByText(HINT)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(BLOCKED)).toBeInTheDocument();
    expect(publishCalls()).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText('Demo'), '');
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(publishCalls()).toHaveLength(1));
  });
});

describe('ProjectEditorPage slug conflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('a taken slug shows the posts’ slug-taken message, not Reload', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByDisplayValue('Notebook');
    put.mockResolvedValue({
      data: undefined,
      error: { error: 'slug_taken', message: 'Slug taken' },
      response: { status: 409 },
    });

    const slug = screen.getByLabelText('Slug', { exact: false });
    await user.clear(slug);
    await user.type(slug, 'posts');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'That slug is already taken. Choose a different slug.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Reload and try again/i)).not.toBeInTheDocument();
  });
});

describe('ProjectEditorPage lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('Publish, Unpublish, Discard and Delete call the project routes', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const published = {
      ...baseProject,
      status: 'published' as const,
      version: 2,
      publishedAt: '2026-10-04T01:00:00.000Z',
    };
    post.mockImplementation(async (path: string) => {
      if (path.endsWith('/publish')) return ok(published);
      if (path.endsWith('/unpublish')) {
        return ok({ ...baseProject, version: 4 });
      }
      if (path.endsWith('/discard')) {
        return ok({ ...published, version: 3, hasUnpublishedChanges: false });
      }
      throw new Error(`unexpected POST ${path}`);
    });
    del.mockResolvedValue(
      ok({ ...baseProject, status: 'deleted', version: 5 }),
    );
    const router = renderEditor();
    await screen.findByDisplayValue('Notebook');

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/admin/projects/{id}/publish', {
        params: { path: { id: PROJECT_ID } },
        body: { version: 1 },
      }),
    );
    expect(
      await screen.findByRole('link', { name: 'View live' }),
    ).toHaveAttribute('href', 'http://localhost:5173/projects/notebook');

    put.mockResolvedValue(
      ok({
        ...published,
        version: 3,
        pitch: 'edit',
        hasUnpublishedChanges: true,
      }),
    );
    await user.type(screen.getByLabelText('Pitch', { exact: false }), '!');
    await save(user);
    await user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/admin/projects/{id}/discard', {
        params: { path: { id: PROJECT_ID } },
        body: { version: 3 },
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Unpublish' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/admin/projects/{id}/unpublish', {
        params: { path: { id: PROJECT_ID } },
        body: { version: 3 },
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Unpublish' }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(del).toHaveBeenCalledWith('/api/admin/projects/{id}', {
        params: { path: { id: PROJECT_ID } },
        body: { version: 4 },
      }),
    );
    await screen.findByText('Projects list');
    expect(router.state.location.pathname).toBe('/projects');
    confirm.mockRestore();
  });

  test('a published project with href views live at its href', async () => {
    renderEditor({
      ...baseProject,
      status: 'published',
      href: '/dont-feed-the-bears',
    });
    expect(
      await screen.findByRole('link', { name: 'View live' }),
    ).toHaveAttribute('href', 'http://localhost:5173/dont-feed-the-bears');
  });

  test('a published project views live on gagnechris.com in prod', async () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    renderEditor({ ...baseProject, status: 'published' });
    const link = await screen.findByRole('link', { name: 'View live' });
    expect(link).toHaveAttribute(
      'href',
      'https://gagnechris.com/projects/notebook',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('ProjectEditorPage preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('renders the body exactly as the published project page does', async () => {
    const project = {
      ...baseProject,
      bodyMarkdown: `${EVERY_MARKDOWN_ELEMENT}\n- **Stack** TypeScript\n- **Data** DynamoDB\n`,
    };
    renderEditor(project);
    await screen.findByDisplayValue('Notebook');

    const published = document.createElement('div');
    published.innerHTML = renderProjectPageBodyHtml(projectPageView(project));
    const publishedBody = published.querySelector(
      '.project-page .project-main > .project-body',
    );
    const previewBody = document.querySelector(
      '.admin-body-preview .project-page .project-main > .project-body',
    );
    expect(publishedBody?.querySelector('dl')).not.toBeNull();
    expect(publishedBody?.querySelector('figcaption')).not.toBeNull();
    expect(previewBody?.outerHTML).toBe(publishedBody?.outerHTML);
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
  });

  test('root-relative links and images in the body open on the public site', async () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    renderEditor({
      ...baseProject,
      bodyMarkdown:
        'Read [the welcome post](/posts/welcome) or [elsewhere](https://example.com/x).\n\n![Screenshot](/media/projects/notebook.png)',
    });
    await screen.findByDisplayValue('Notebook');

    const preview = document.querySelector<HTMLElement>('.admin-body-preview')!;
    const link = within(preview).getByRole('link', {
      name: 'the welcome post',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://gagnechris.com/posts/welcome',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      within(preview).getByRole('link', { name: 'elsewhere' }),
    ).toHaveAttribute('href', 'https://example.com/x');
    expect(
      within(preview).getByRole('img', { name: 'Screenshot' }),
    ).toHaveAttribute(
      'src',
      'https://gagnechris.com/media/projects/notebook.png',
    );
  });
});
