import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  createPost,
  deletePost,
  discardPost,
  fetchPost,
  fetchPostsPage,
  publishPost,
  unpublishPost,
  updatePost,
  type CreatePostRequest,
  type PostListFilters,
  type Post,
  type UpdatePostRequest,
} from './api.js';
import { setCachedPost } from './cache.js';
import { createDraftPublishResource } from './createDraftPublishResource.js';
import { useDeleteEntityMutation } from './createVersionedResource.js';
import { queryKeys } from './keys.js';
import { siteTooLargeMessage } from './tooLarge.js';

export type PostResourceParams = { id: string };

export const postResource = createDraftPublishResource<
  Post,
  PostResourceParams
>({
  queryKey: ({ id }) => queryKeys.posts.detail(id),
  fetch: (client, { id }) => fetchPost(client, id),
  update: (client, { id }, body) =>
    updatePost(client, id, body as UpdatePostRequest),
  publish: (client, { id }, body) => publishPost(client, id, body),
  unpublish: (client, { id }, body) => unpublishPost(client, id, body),
  discard: (client, { id }, body) => discardPost(client, id, body),
  setCache: setCachedPost,
  tooLargeMessage: siteTooLargeMessage('this post'),
});

/** Filters run on the server; `limit` is part of the key so a short palette page never fills the Posts page cache. */
export const usePostsQuery = (
  filters: PostListFilters = {},
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const getClient = useGetApiClient();
  const status = filters.status;
  const q = filters.q?.trim() || undefined;
  const limit = filters.limit;
  const keyFilters = {
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    ...(limit ? { limit } : {}),
  };
  return useInfiniteQuery({
    queryKey: queryKeys.posts.list(
      Object.keys(keyFilters).length ? keyFilters : undefined,
    ),
    queryFn: ({ pageParam }) =>
      fetchPostsPage(getClient(), pageParam, { status, q, limit }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    enabled,
  });
};

export const useCreatePostMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: CreatePostRequest) => createPost(getClient(), body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post);
    },
  });
};

export const useDeletePostMutation = () =>
  useDeleteEntityMutation(deletePost, setCachedPost);
