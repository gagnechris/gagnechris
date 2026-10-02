import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../api/client', () => ({
  createApiClient: () => ({
    GET: (...args: unknown[]) => get(...args),
    PUT: (...args: unknown[]) => put(...args),
    POST: (...args: unknown[]) => post(...args),
    DELETE: (...args: unknown[]) => del(...args),
  }),
}));

vi.mock('../components/markdown/MarkdownEditor', () => ({
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

vi.mock('../components/markdown/MarkdownPreview', () => ({
  default: () => <div data-testid="preview" />,
}));

const basePost = {
  id: '01TESTPOSTID00000000000000',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: 'line one',
  tags: [] as string[],
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
    [{ path: '/admin/posts/:postId', element: <PostEditorPage /> }],
    { initialEntries: ['/admin/posts/01TESTPOSTID00000000000000'] },
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

  test('edits typed during an in-flight save are not marked Saved after publish (CHR-124)', async () => {
    const user = userEvent.setup();
    let resolvePut!: (value: unknown) => void;
    put.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
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
    // Trigger autosave (debounce is 900ms; wait via fake? use real timers + click Save)
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));

    await user.type(markdown, ' second');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    resolvePut({
      data: {
        ...basePost,
        bodyMarkdown: 'line one first',
        version: 2,
      },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => expect(post).toHaveBeenCalled());

    resolvePublish({
      data: {
        ...basePost,
        status: 'published',
        version: 3,
        bodyMarkdown: 'line one first',
        publishedAt: '2026-09-27T01:00:00.000Z',
        hasUnpublishedChanges: false,
      },
      error: undefined,
      response: { status: 200 },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Markdown')).toHaveValue(
        'line one first second',
      );
    });
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
        { path: '/admin/posts/:postId', element: <PostEditorPage /> },
        { path: '/admin', element: <p>Posts list</p> },
      ],
      { initialEntries: ['/admin/posts/01TESTPOSTID00000000000000'] },
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
    expect(router.state.location.pathname).toBe('/admin');

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
        { path: '/admin/posts/:postId', element: <PostEditorPage /> },
        { path: '/admin', element: <p>Posts list</p> },
      ],
      { initialEntries: ['/admin/posts/01TESTPOSTID00000000000000'] },
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
