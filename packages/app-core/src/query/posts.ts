import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
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
} from './api.js';
import {
  preferNewerByVersion,
  removeCachedPost,
  setCachedPost,
} from './cache.js';
import { queryKeys } from './keys.js';

export const usePostsQuery = () => {
  const getClient = useGetApiClient();
  return useQuery({
    queryKey: queryKeys.posts.list(),
    queryFn: () => fetchPosts(getClient()),
  });
};

export const usePostQuery = (id: string | undefined) => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.posts.detail(id ?? ''),
    queryFn: async () => {
      const fetched = await fetchPost(getClient(), id!);
      const cached = queryClient.getQueryData<Post>(
        queryKeys.posts.detail(id!),
      );
      return preferNewerByVersion(cached, fetched);
    },
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnMount: 'always',
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

export const useUpdatePostMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePostRequest }) =>
      updatePost(getClient(), id, body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post);
    },
  });
};

/** Apply a successful save (from useQueuedAutosave) into Query caches. */
export const useSetPostCache = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (post: Post) => {
      setCachedPost(queryClient, post);
    },
    [queryClient],
  );
};

export const useDeletePostMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePost(getClient(), id),
    onSuccess: (_post, id) => {
      removeCachedPost(queryClient, id);
    },
  });
};

export const usePublishPostMutation = (id: string) => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) =>
      publishPost(getClient(), id, body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post);
    },
  });
};

export const useUnpublishPostMutation = (id: string) => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) =>
      unpublishPost(getClient(), id, body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post);
    },
  });
};

export const useDiscardPostMutation = (id: string) => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) =>
      discardPost(getClient(), id, body),
    onSuccess: (post) => {
      setCachedPost(queryClient, post);
    },
  });
};

/** MutateResult adapters for useDraftPublishEditor. */
export const usePostLifecycleMutators = (id: string | undefined) => {
  const publish = usePublishPostMutation(id ?? '');
  const unpublish = useUnpublishPostMutation(id ?? '');
  const discard = useDiscardPostMutation(id ?? '');

  const publishFn = useCallback(
    (body: ExpectedVersionRequest) =>
      asMutateResult(() => publish.mutateAsync(body)),
    [publish],
  );
  const unpublishFn = useCallback(
    (body: ExpectedVersionRequest) =>
      asMutateResult(() => unpublish.mutateAsync(body)),
    [unpublish],
  );
  const discardFn = useCallback(
    (body: ExpectedVersionRequest) =>
      asMutateResult(() => discard.mutateAsync(body)),
    [discard],
  );

  return {
    publish: publishFn,
    unpublish: unpublishFn,
    discard: discardFn,
  };
};
