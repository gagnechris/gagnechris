import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryRouter,
  RouterProvider,
} from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import PostEditorPage from './PostEditorPage'

const get = vi.fn()
const put = vi.fn()
const post = vi.fn()

vi.mock('../api/client', () => ({
  createApiClient: () => ({
    GET: (...args: unknown[]) => get(...args),
    PUT: (...args: unknown[]) => put(...args),
    POST: (...args: unknown[]) => post(...args),
    DELETE: vi.fn(),
  }),
}))

vi.mock('../components/markdown/MarkdownEditor', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <textarea
      aria-label="Markdown"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

vi.mock('../components/markdown/MarkdownPreview', () => ({
  default: () => <div data-testid="preview" />,
}))

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
}

function renderEditor() {
  const router = createMemoryRouter(
    [{ path: '/admin/posts/:postId', element: <PostEditorPage /> }],
    { initialEntries: ['/admin/posts/01TESTPOSTID00000000000000'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('PostEditorPage publish (CHR-113)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({
      data: { ...basePost },
      error: undefined,
      response: { status: 200 },
    })
    put.mockResolvedValue({
      data: { ...basePost, version: 2 },
      error: undefined,
      response: { status: 200 },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('typing during a slow publish is not overwritten', async () => {
    const user = userEvent.setup()
    let resolvePublish!: (value: unknown) => void
    post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePublish = resolve
        }),
    )

    renderEditor()
    await screen.findByDisplayValue('Hello')

    await user.click(screen.getByRole('button', { name: 'Publish' }))

    const markdown = screen.getByLabelText('Markdown')
    await user.clear(markdown)
    await user.type(markdown, 'typed while publishing')

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
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Markdown')).toHaveValue(
        'typed while publishing',
      )
    })
  })
})
