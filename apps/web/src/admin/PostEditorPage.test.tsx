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

vi.mock('../api/client', () => ({
  createApiClient: () => ({
    GET: (...args: unknown[]) => get(...args),
    PUT: (...args: unknown[]) => put(...args),
    POST: (...args: unknown[]) => post(...args),
    DELETE: vi.fn(),
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
    const user = userEvent.setup();
    const queryClient = createTestQueryClient();

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
    expect(put).not.toHaveBeenCalled();
  });
});
