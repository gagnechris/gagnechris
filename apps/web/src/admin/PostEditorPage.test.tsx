import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { QueryClientTestProvider, createTestQueryClient } from '../test-utils';
import PostEditorPage from './PostEditorPage';
import { queryKeys } from '@gagnechris/app-core';

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

const basePost = {
  id: '01TESTPOSTID00000000000000',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: 'line one',
  tags: [] as string[],
  projectIds: [] as string[],
  status: 'draft' as const,
  publishedAt: null as string | null,
  updatedAt: '2026-09-27T00:00:00.000Z',
  coverImage: null as string | null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

function renderEditor(queryClient = createTestQueryClient()) {
  const router = createMemoryRouter(
    [{ path: '/posts/:postId', element: <PostEditorPage /> }],
    { initialEntries: ['/posts/01TESTPOSTID00000000000000'] },
  );
  return render(
    <QueryClientTestProvider queryClient={queryClient}>
      <RouterProvider router={router} />
    </QueryClientTestProvider>,
  );
}

describe('PostEditorPage publish (CHR-113)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: { ...basePost },
      error: undefined,
      response: { status: 200 },
    });
    put.mockResolvedValue({
      data: { ...basePost, version: 2 },
      error: undefined,
      response: { status: 200 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('typing during a slow publish is not overwritten', async () => {
    const user = userEvent.setup();
    let resolvePublish!: (value: unknown) => void;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePublish = resolve;
        }),
    );

    renderEditor();
    await screen.findByDisplayValue('Hello');

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    const markdown = screen.getByLabelText('Markdown');
    await user.clear(markdown);
    await user.type(markdown, 'typed while publishing');

    resolvePublish({
      data: {
        ...basePost,
        status: 'published',
        version: 3,
        bodyMarkdown: 'line one',
        publishedAt: '2026-09-27T01:00:00.000Z',
        hasUnpublishedChanges: false,
      },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Markdown')).toHaveValue(
        'typed while publishing',
      );
    });
  });

  test('an edit typed during an in-flight save is saved before publishing; edits during the publish stay unsaved', async () => {
    const user = userEvent.setup();
    const putResolvers: ((value: unknown) => void)[] = [];
    put.mockImplementation(
      () =>
        new Promise((resolve) => {
          putResolvers.push(resolve);
        }),
    );
    let resolvePublish!: (value: unknown) => void;
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePublish = resolve;
        }),
    );

    renderEditor();
    await screen.findByDisplayValue('Hello');

    const markdown = screen.getByLabelText('Markdown');
    await user.type(markdown, ' first');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));

    await user.type(markdown, ' second');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    putResolvers[0]!({
      data: { ...basePost, bodyMarkdown: 'line one first', version: 2 },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1]?.[1]).toMatchObject({
      body: { bodyMarkdown: 'line one first second', version: 2 },
    });
    expect(post).not.toHaveBeenCalled();

    putResolvers[1]!({
      data: { ...basePost, bodyMarkdown: 'line one first second', version: 3 },
      error: undefined,
      response: { status: 200 },
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]?.[1]).toMatchObject({ body: { version: 3 } });

    await user.type(markdown, ' third');

    resolvePublish({
      data: {
        ...basePost,
        status: 'published',
        version: 4,
        bodyMarkdown: 'line one first second',
        publishedAt: '2026-09-27T01:00:00.000Z',
        hasUnpublishedChanges: false,
      },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Unpublish' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Markdown')).toHaveValue(
      'line one first second third',
    );
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.queryByText(/^Saved$/)).not.toBeInTheDocument();
  });
});

describe('PostEditorPage version / refetch (CHR-147)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('waits for mount fetch before hydrating so stale cache cannot seed the draft', async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.posts.detail(basePost.id), {
      ...basePost,
      title: 'Stale cache title',
      bodyMarkdown: 'stale body',
      version: 1,
    });

    get.mockResolvedValue({
      data: {
        ...basePost,
        title: 'Fresh from server',
        bodyMarkdown: 'fresh body',
        version: 2,
      },
      error: undefined,
      response: { status: 200 },
    });

    renderEditor(queryClient);
    expect(screen.getByText('Loading editor…')).toBeInTheDocument();
    await screen.findByDisplayValue('Fresh from server');
    expect(screen.getByLabelText('Markdown')).toHaveValue('fresh body');
  });

  test('newer refetch while dirty shows conflict and does not PUT with new version + old content', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    const queryClient = createTestQueryClient();

    get.mockResolvedValue({
      data: { ...basePost },
      error: undefined,
      response: { status: 200 },
    });
    put.mockImplementation(
      async (_path: unknown, init?: { body?: { version?: number } }) => {
        const version = init?.body?.version ?? 1;
        return {
          data: { ...basePost, version: version + 1 },
          error: undefined,
          response: { status: 200 },
        };
      },
    );

    renderEditor(queryClient);
    await screen.findByDisplayValue('Hello');

    const markdown = screen.getByLabelText('Markdown');
    await user.type(markdown, ' local edit');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    put.mockClear();
    queryClient.setQueryData(queryKeys.posts.detail(basePost.id), {
      ...basePost,
      version: 5,
      bodyMarkdown: 'phone edit',
      title: 'Phone title',
    });

    await screen.findByRole('alert');
    expect(
      screen.getByText(
        'Conflict — another save updated this post. Reload and try again.',
      ),
    ).toBeInTheDocument();

    // Still showing local dirty draft, not adopting phone content
    expect(screen.getByLabelText('Markdown')).toHaveValue(
      'line one local edit',
    );

    // Advance past the 900ms autosave debounce — every PUT must still carry
    // the pre-conflict bound version, never the phone's version 5 (CHR-165).
    await vi.advanceTimersByTimeAsync(1000);
    for (const call of put.mock.calls) {
      const body = call[1]?.body as { version?: number } | undefined;
      expect(body?.version).toBeDefined();
      expect(body!.version!).toBeLessThan(5);
    }
  });

  test('stale GET after PUT does not downgrade the editor cache (CHR-165)', async () => {
    const queryClient = createTestQueryClient();
    get.mockResolvedValue({
      data: { ...basePost, version: 1 },
      error: undefined,
      response: { status: 200 },
    });
    put.mockResolvedValue({
      data: { ...basePost, version: 2, bodyMarkdown: 'saved body' },
      error: undefined,
      response: { status: 200 },
    });

    renderEditor(queryClient);
    await screen.findByDisplayValue('Hello');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Markdown'), ' x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalled());

    // Late GET via the mounted resource queryFn (preferNewerByVersion).
    // An inline setQueryData that reimplements the rule would hide regressions (CHR-178).
    get.mockResolvedValueOnce({
      data: { ...basePost, version: 1, bodyMarkdown: 'line one' },
      error: undefined,
      response: { status: 200 },
    });
    await queryClient.refetchQueries({
      queryKey: queryKeys.posts.detail(basePost.id),
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData(queryKeys.posts.detail(basePost.id)),
      ).toEqual(expect.objectContaining({ version: 2 }));
    });
    expect(screen.getByLabelText('Markdown')).toHaveValue('line one x');
  });
});

describe('PostEditorPage delete (CHR-158)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: { ...basePost },
      error: undefined,
      response: { status: 200 },
    });
    put.mockResolvedValue({
      data: { ...basePost, version: 2 },
      error: undefined,
      response: { status: 200 },
    });
  });

  test('no PUT after DELETE starts, no GET of deleted post, no leave prompt', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    let resolveDelete!: (value: unknown) => void;
    del.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );

    const router = createMemoryRouter(
      [
        { path: '/posts/:postId', element: <PostEditorPage /> },
        { path: '/', element: <p>Posts list</p> },
      ],
      { initialEntries: ['/posts/01TESTPOSTID00000000000000'] },
    );

    render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );

    await screen.findByDisplayValue('Hello');
    const markdown = screen.getByLabelText('Markdown');
    await user.type(markdown, ' dirty');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    put.mockClear();
    get.mockClear();
    confirmSpy.mockClear();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('Soft-delete'),
    );

    // Autosave hold: no PUT while DELETE is in flight.
    await new Promise((r) => setTimeout(r, 1000));
    expect(put).not.toHaveBeenCalled();

    const getCallsDuringDelete = get.mock.calls.length;

    resolveDelete({
      data: { ...basePost, status: 'deleted', version: 2 },
      error: undefined,
      response: { status: 200 },
    });

    await screen.findByText('Posts list');
    expect(router.state.location.pathname).toBe('/');

    // No additional GET of the deleted post after DELETE started.
    expect(get.mock.calls.length).toBe(getCallsDuringDelete);
    expect(
      confirmSpy.mock.calls.some(
        ([msg]) => typeof msg === 'string' && msg.includes('Leave'),
      ),
    ).toBe(false);

    confirmSpy.mockRestore();
  });

  test('Delete waits for an in-flight PUT before calling DELETE (CHR-165)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    let resolvePut!: (value: unknown) => void;
    let putStarted = false;
    put.mockImplementation(
      () =>
        new Promise((resolve) => {
          putStarted = true;
          resolvePut = resolve;
        }),
    );

    const deleteOrder: string[] = [];
    del.mockImplementation(async () => {
      deleteOrder.push('delete');
      return {
        data: { ...basePost, status: 'deleted', version: 3 },
        error: undefined,
        response: { status: 200 },
      };
    });

    const router = createMemoryRouter(
      [
        { path: '/posts/:postId', element: <PostEditorPage /> },
        { path: '/', element: <p>Posts list</p> },
      ],
      { initialEntries: ['/posts/01TESTPOSTID00000000000000'] },
    );

    render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );

    await screen.findByDisplayValue('Hello');
    await user.type(screen.getByLabelText('Markdown'), ' pending');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(putStarted).toBe(true));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    // DELETE must not start until the in-flight PUT resolves.
    expect(del).not.toHaveBeenCalled();

    deleteOrder.push('put-resolve');
    resolvePut({
      data: { ...basePost, bodyMarkdown: 'line one pending', version: 2 },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(deleteOrder).toEqual(['put-resolve', 'delete']);
    await screen.findByText('Posts list');
    confirmSpy.mockRestore();
  });

  test('slug collision shows slug-taken message, not Reload (CHR-160)', async () => {
    const user = userEvent.setup();
    put.mockResolvedValue({
      data: undefined,
      error: { error: 'slug_taken', message: 'Slug taken' },
      response: { status: 409 },
    });

    renderEditor();
    await screen.findByDisplayValue('Hello');

    const slug = screen.getByLabelText('Slug');
    await user.clear(slug);
    await user.type(slug, 'taken-slug');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'That slug is already taken. Choose a different slug.',
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Reload and try again/i)).not.toBeInTheDocument();
  });
});

describe('PostEditorPage navigation (CHR-178)', () => {
  const otherPost = {
    ...basePost,
    id: '01OTHERPOSTID0000000000000',
    slug: 'other',
    title: 'Other post',
    bodyMarkdown: 'other body',
  };

  function renderWithRoutes() {
    const router = createMemoryRouter(
      [
        { path: '/posts/:postId', element: <PostEditorPage /> },
        { path: '/', element: <p>Posts list</p> },
      ],
      { initialEntries: [`/posts/${basePost.id}`] },
    );
    render(
      <QueryClientTestProvider>
        <RouterProvider router={router} />
      </QueryClientTestProvider>,
    );
    return router;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation(
      async (
        _path: unknown,
        init?: { params?: { path?: { id?: string } } },
      ) => ({
        data:
          init?.params?.path?.id === otherPost.id
            ? { ...otherPost }
            : { ...basePost },
        error: undefined,
        response: { status: 200 },
      }),
    );
    put.mockResolvedValue({
      data: { ...basePost, bodyMarkdown: 'line one dirty', version: 2 },
      error: undefined,
      response: { status: 200 },
    });
  });

  test('leave guard saves dirty edits before navigating away', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const router = renderWithRoutes();

    await screen.findByDisplayValue('Hello');
    await user.type(screen.getByLabelText('Markdown'), ' dirty');

    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    let resolvePut!: (value: unknown) => void;
    put.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );

    await act(async () => {
      void router.navigate('/');
    });

    // Blocked until the save lands.
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0]?.[1]?.body).toMatchObject({
      bodyMarkdown: 'line one dirty',
    });
    expect(router.state.location.pathname).toBe(`/posts/${basePost.id}`);

    resolvePut({
      data: { ...basePost, bodyMarkdown: 'line one dirty', version: 2 },
      error: undefined,
      response: { status: 200 },
    });
    await screen.findByText('Posts list');
    // Save landed, so there was nothing to ask about.
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  test('leave guard asks when the save fails and stays on cancel', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    put.mockResolvedValue({
      data: undefined,
      error: { error: 'internal', message: 'Boom' },
      response: { status: 500 },
    });
    const router = renderWithRoutes();

    await screen.findByDisplayValue('Hello');
    await user.type(screen.getByLabelText('Markdown'), ' dirty');

    await act(async () => {
      await router.navigate('/');
    });

    await waitFor(() =>
      expect(confirmSpy).toHaveBeenCalledWith(
        'Your changes could not be saved. Leave without saving?',
      ),
    );
    expect(router.state.location.pathname).toBe(`/posts/${basePost.id}`);
    expect(screen.queryByText('Posts list')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Markdown')).toHaveValue('line one dirty');
    confirmSpy.mockRestore();
  });

  test('switching posts remounts the editor so A state does not leak into B', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    put.mockResolvedValue({
      data: undefined,
      error: { error: 'conflict', message: 'Conflict' },
      response: { status: 409 },
    });
    const router = renderWithRoutes();

    await screen.findByDisplayValue('Hello');
    await user.type(screen.getByLabelText('Markdown'), ' dirty');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(
      'Conflict — another save updated this post. Reload and try again.',
    );

    // Leave A (save fails → confirm "leave anyway") and open B.
    await act(async () => {
      await router.navigate(`/posts/${otherPost.id}`);
    });
    await screen.findByDisplayValue('Other post');
    expect(screen.getByLabelText('Markdown')).toHaveValue('other body');
    // A's conflict banner must not carry over to B.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Reload and try again/)).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});

describe('PostEditorPage projects', () => {
  const project = (id: string, name: string, stage: string, order: number) => ({
    id,
    slug: name.toLowerCase(),
    name,
    stage,
    order,
    status: 'published',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation(async (path: string) =>
      path === '/api/admin/projects'
        ? {
            data: {
              items: [
                project('01NOTEBOOK', 'Notebook', 'building', 2),
                project('01POSTS', 'Posts', 'live', 1),
              ],
            },
            error: undefined,
            response: { status: 200 },
          }
        : {
            data: { ...basePost, projectIds: ['01NOTEBOOK'] },
            error: undefined,
            response: { status: 200 },
          },
    );
    put.mockImplementation(
      async (_path: string, { body }: { body: Record<string, unknown> }) => ({
        data: { ...basePost, ...body, version: 2 },
        error: undefined,
        response: { status: 200 },
      }),
    );
  });

  test('lists each project with its stage and saves the tags', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByDisplayValue('Hello');

    const group = await screen.findByRole('group', { name: 'Part of project' });
    expect(group).toHaveAccessibleDescription(
      'Lists this post in the project’s Build log. Not the same as Tags.',
    );
    const boxes = within(group).getAllByRole('checkbox');
    expect(boxes.map((b) => b.closest('label')?.textContent)).toEqual([
      'Posts · Live',
      'Notebook · Building',
    ]);
    expect(
      within(group).getByRole('checkbox', { name: 'Notebook · Building' }),
    ).toBeChecked();

    const posts = within(group).getByRole('checkbox', { name: 'Posts · Live' });
    posts.focus();
    await user.keyboard(' ');
    expect(posts).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0]?.[1]).toMatchObject({
      body: { projectIds: ['01NOTEBOOK', '01POSTS'] },
    });

    await user.click(
      within(group).getByRole('checkbox', { name: 'Notebook · Building' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls[1]?.[1]).toMatchObject({
      body: { projectIds: ['01POSTS'] },
    });
  });
});

describe('PostEditorPage View live', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({
      data: { ...basePost, status: 'published' },
      error: undefined,
      response: { status: 200 },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('opens the post on the public dev origin in a new tab', async () => {
    renderEditor();
    const link = await screen.findByRole('link', { name: 'View live' });
    expect(link).toHaveAttribute('href', 'http://localhost:5173/posts/hello');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
  });

  test('opens the post on gagnechris.com in prod', async () => {
    vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://gagnechris.com');
    renderEditor();
    expect(
      await screen.findByRole('link', { name: 'View live' }),
    ).toHaveAttribute('href', 'https://gagnechris.com/posts/hello');
  });
});
