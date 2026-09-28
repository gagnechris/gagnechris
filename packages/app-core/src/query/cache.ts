import type { QueryClient } from '@tanstack/react-query';
import type { Home, Post, Resume } from './api.js';
import { queryKeys } from './keys.js';

/** Write a post into detail + list caches (create/save/publish/etc.). */
export const setCachedPost = (queryClient: QueryClient, post: Post): void => {
  queryClient.setQueryData(queryKeys.posts.detail(post.id), post);
  queryClient.setQueryData<Post[]>(queryKeys.posts.list(), (prev) => {
    if (!prev) {
      return post.status === 'deleted' ? prev : [post];
    }
    if (post.status === 'deleted') {
      return prev.filter((p) => p.id !== post.id);
    }
    const index = prev.findIndex((p) => p.id === post.id);
    if (index === -1) {
      return [post, ...prev];
    }
    const next = [...prev];
    next[index] = post;
    return next;
  });
};

export const removeCachedPost = (
  queryClient: QueryClient,
  postId: string,
): void => {
  queryClient.removeQueries({ queryKey: queryKeys.posts.detail(postId) });
  queryClient.setQueryData<Post[]>(queryKeys.posts.list(), (prev) =>
    prev?.filter((p) => p.id !== postId),
  );
};

export const setCachedHome = (queryClient: QueryClient, home: Home): void => {
  queryClient.setQueryData(queryKeys.home(), home);
};

export const setCachedResume = (
  queryClient: QueryClient,
  resume: Resume,
): void => {
  queryClient.setQueryData(queryKeys.resume(), resume);
};
