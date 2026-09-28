import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  asMutateResult,
  createPost,
  deletePost,
  discardPost,
  fetchPost,
  fetchPosts,
  publishPost,
  unpublishPost,
  updatePost,
  type CreatePostRequest,
  type ExpectedVersionRequest,
  type Post,
  type UpdatePostRequest,
} from './api'
import { removeCachedPost, setCachedPost } from './cache'
import { queryKeys } from './keys'

export const usePostsQuery = () =>
  useQuery({
    queryKey: queryKeys.posts.list(),
    queryFn: fetchPosts,
  })

export const usePostQuery = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.posts.detail(id ?? ''),
    queryFn: () => fetchPost(id!),
    enabled: Boolean(id),
  })

export const useCreatePostMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body?: CreatePostRequest) => createPost(body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post)
    },
  })
}

export const useUpdatePostMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: UpdatePostRequest
    }) => updatePost(id, body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post)
    },
  })
}

/** Apply a successful save (from useQueuedAutosave) into Query caches. */
export const useSetPostCache = () => {
  const queryClient = useQueryClient()
  return useCallback(
    (post: Post) => {
      setCachedPost(queryClient, post)
    },
    [queryClient],
  )
}

export const useDeletePostMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deletePost(id),
    onSuccess: (_post, id) => {
      removeCachedPost(queryClient, id)
    },
  })
}

export const usePublishPostMutation = (id: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) => publishPost(id, body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post)
    },
  })
}

export const useUnpublishPostMutation = (id: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) => unpublishPost(id, body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post)
    },
  })
}

export const useDiscardPostMutation = (id: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) => discardPost(id, body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post)
    },
  })
}

/** MutateResult adapters for useDraftPublishEditor. */
export const usePostLifecycleMutators = (id: string | undefined) => {
  const publish = usePublishPostMutation(id ?? '')
  const unpublish = useUnpublishPostMutation(id ?? '')
  const discard = useDiscardPostMutation(id ?? '')

  const publishFn = useCallback(
    (body: ExpectedVersionRequest) =>
      asMutateResult(() => publish.mutateAsync(body)),
    [publish],
  )
  const unpublishFn = useCallback(
    (body: ExpectedVersionRequest) =>
      asMutateResult(() => unpublish.mutateAsync(body)),
    [unpublish],
  )
  const discardFn = useCallback(
    (body: ExpectedVersionRequest) =>
      asMutateResult(() => discard.mutateAsync(body)),
    [discard],
  )

  return {
    publish: publishFn,
    unpublish: unpublishFn,
    discard: discardFn,
  }
}
