import type { ApiClient } from '@gagnechris/api-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
import type { ExpectedVersionRequest } from './api.js';
import { preferNewerByVersion } from './cache.js';

export type VersionedEntity = { version: number };

const isTombstone = (entity: object): boolean =>
  ('deleted' in entity && entity.deleted === true) ||
  ('status' in entity && entity.status === 'deleted');

export type VersionedResourceConfig<
  TEntity extends VersionedEntity,
  TParams,
> = {
  queryKey: (params: TParams) => QueryKey;
  fetch: (client: ApiClient, params: TParams) => Promise<TEntity>;
  update: (
    client: ApiClient,
    params: TParams,
    body: ExpectedVersionRequest & Record<string, unknown>,
  ) => Promise<TEntity>;
  delete?: (
    client: ApiClient,
    params: TParams,
    body: ExpectedVersionRequest,
  ) => Promise<TEntity>;
  setCache: (queryClient: QueryClient, entity: TEntity) => void;
};

/** Publishable entities layer `createDraftPublishResource` on top. */
export function createVersionedResource<
  TEntity extends VersionedEntity,
  TParams,
>(config: VersionedResourceConfig<TEntity, TParams>) {
  const useEntityQuery = (params: TParams, enabled = true) => {
    const getClient = useGetApiClient();
    const queryClient = useQueryClient();
    const key = config.queryKey(params);
    return useQuery({
      queryKey: key,
      queryFn: async () => {
        const fetched = await config.fetch(getClient(), params);
        const cached = queryClient.getQueryData<TEntity>(key);
        // A deleted entry never beats what the server serves now (for a
        // daily, a fresh placeholder at version 0).
        if (cached && isTombstone(cached)) return fetched;
        return preferNewerByVersion(cached, fetched);
      },
      enabled,
      staleTime: 0,
      refetchOnMount: 'always' as const,
    });
  };

  const useSetCache = () => {
    const queryClient = useQueryClient();
    return useCallback(
      (entity: TEntity) => {
        config.setCache(queryClient, entity);
      },
      [queryClient],
    );
  };

  return {
    queryKey: config.queryKey,
    fetch: config.fetch,
    update: config.update,
    delete: config.delete,
    setCache: config.setCache,
    useQuery: useEntityQuery,
    useSetCache,
  };
}

export type VersionedResource<
  TEntity extends VersionedEntity,
  TParams,
> = ReturnType<typeof createVersionedResource<TEntity, TParams>>;

/**
 * Deletes by id and caches the returned tombstone (not `removeQueries`), so an
 * open editor does not flash Loading or refetch.
 */
export const useDeleteEntityMutation = <TEntity>(
  remove: (
    client: ApiClient,
    id: string,
    body: ExpectedVersionRequest,
  ) => Promise<TEntity>,
  setCache: (queryClient: QueryClient, entity: TEntity) => void,
  onDeleted?: (queryClient: QueryClient) => void,
) => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      remove(getClient(), id, { version }),
    onSuccess: (entity) => {
      setCache(queryClient, entity);
      onDeleted?.(queryClient);
    },
  });
};
