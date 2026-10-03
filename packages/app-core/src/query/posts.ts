import {
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
  type Post,
  type UpdatePostRequest,
} from './api.js';
import { setCachedPost } from './cache.js';
import { createDraftPublishResource } from './createDraftPublishResource.js';
import { queryKeys } from './keys.js';

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
});

export const usePostsQuery = () => {
  const getClient = useGetApiClient();
  return useInfiniteQuery({
    queryKey: queryKeys.posts.list(),
    queryFn: ({ pageParam }) => fetchPostsPage(getClient(), pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
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

export const useSetPostCache = postResource.useSetCache;

/** setCachedPost, not removeQueries, so an open editor does not flash Loading or refetch. */
export const useDeletePostMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      deletePost(getClient(), id, { version }),
    onSuccess: (post) => {
      setCachedPost(queryClient, post);
    },
  });
};
