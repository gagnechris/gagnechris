import type { ApiClient } from '@gagnechris/api-client';
import {
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
  /** Optional soft-delete (notes, posts). Sends the expected version (CHR-186). */
  delete?: (
    client: ApiClient,
    params: TParams,
    body: ExpectedVersionRequest,
  ) => Promise<TEntity>;
  setCache: (queryClient: QueryClient, entity: TEntity) => void;
};

/**
 * Query + cache + update (+ optional delete) for any versioned entity.
 * Publishable entities layer `createDraftPublishResource` on top (CHR-173).
 */
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
