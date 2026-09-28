import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Post } from './api'
import { queryKeys } from './keys'
import {
  useDeletePostMutation,
  usePublishPostMutation,
} from './posts'

const post = vi.fn()
const del = vi.fn()

vi.mock('../../api/client', () => ({
  createApiClient: () => ({
    POST: (...args: unknown[]) => post(...args),
    DELETE: (...args: unknown[]) => del(...args),
  }),
}))

const draftPost: Post = {
  id: '01POST',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: '',
  tags: [],
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-09-27T00:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
}

describe('post mutation cache updates (CHR-131)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(queryKeys.posts.list(), [draftPost])
    queryClient.setQueryData(queryKeys.posts.detail(draftPost.id), draftPost)
  })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  test('publish updates the posts list cache without a refetch', async () => {
    const published: Post = {
      ...draftPost,
      status: 'published',
      version: 2,
      publishedAt: '2026-09-27T01:00:00.000Z',
    }
    post.mockResolvedValue({
      data: published,
      error: undefined,
      response: { status: 200 },
    })

    const { result } = renderHook(
      () => usePublishPostMutation(draftPost.id),
      { wrapper },
    )

    await result.current.mutateAsync({ version: 1 })

    await waitFor(() => {
      const list = queryClient.getQueryData<Post[]>(queryKeys.posts.list())
      expect(list?.[0]?.status).toBe('published')
      expect(list?.[0]?.version).toBe(2)
    })

    expect(
      queryClient.getQueryData<Post>(queryKeys.posts.detail(draftPost.id))
        ?.status,
    ).toBe('published')

    // Cache was updated in-place via setQueryData — only the publish POST ran.
    expect(post).toHaveBeenCalledTimes(1)
    expect(
      queryClient.getQueryState(queryKeys.posts.list())?.fetchStatus,
    ).toBe('idle')
  })

  test('delete removes the post from the list cache without a refetch', async () => {
    del.mockResolvedValue({
      data: { ...draftPost, status: 'deleted' },
      error: undefined,
      response: { status: 200 },
    })

    const { result } = renderHook(() => useDeletePostMutation(), { wrapper })

    await result.current.mutateAsync(draftPost.id)

    await waitFor(() => {
      expect(
        queryClient.getQueryData<Post[]>(queryKeys.posts.list()),
      ).toEqual([])
    })
    expect(
      queryClient.getQueryData(queryKeys.posts.detail(draftPost.id)),
    ).toBeUndefined()
    expect(del).toHaveBeenCalledTimes(1)
  })
})
