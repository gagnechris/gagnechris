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
import {
  asMutateResult,
  type ExpectedVersionRequest,
  type MutateResult,
} from './api.js';
import { preferNewerByVersion } from './cache.js';

export type VersionedEntity = { version: number };

export type DraftPublishResourceConfig<
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
  publish: (
    client: ApiClient,
    params: TParams,
    body: ExpectedVersionRequest,
  ) => Promise<TEntity>;
  unpublish: (
    client: ApiClient,
    params: TParams,
    body: ExpectedVersionRequest,
  ) => Promise<TEntity>;
  discard: (
    client: ApiClient,
    params: TParams,
    body: ExpectedVersionRequest,
  ) => Promise<TEntity>;
  setCache: (queryClient: QueryClient, entity: TEntity) => void;
};

export type DraftPublishLifecycleMutators<TEntity> = {
  publish: (body: ExpectedVersionRequest) => Promise<MutateResult<TEntity>>;
  unpublish: (body: ExpectedVersionRequest) => Promise<MutateResult<TEntity>>;
  discard: (body: ExpectedVersionRequest) => Promise<MutateResult<TEntity>>;
};

/**
 * One factory for post / home / resume (and future entities): query hook,
 * cache setter, and lifecycle mutators from a small config object (CHR-158).
 */
export function createDraftPublishResource<
  TEntity extends VersionedEntity,
  TParams,
>(config: DraftPublishResourceConfig<TEntity, TParams>) {
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

  const useLifecycleMutators = (
    params: TParams,
  ): DraftPublishLifecycleMutators<TEntity> => {
    const getClient = useGetApiClient();
    const queryClient = useQueryClient();

    const publish = useMutation({
      mutationFn: (body: ExpectedVersionRequest) =>
        config.publish(getClient(), params, body),
      onSuccess: (entity) => {
        config.setCache(queryClient, entity);
      },
    });
    const unpublish = useMutation({
      mutationFn: (body: ExpectedVersionRequest) =>
        config.unpublish(getClient(), params, body),
      onSuccess: (entity) => {
        config.setCache(queryClient, entity);
      },
    });
    const discard = useMutation({
      mutationFn: (body: ExpectedVersionRequest) =>
        config.discard(getClient(), params, body),
      onSuccess: (entity) => {
        config.setCache(queryClient, entity);
      },
    });

    const publishAsync = publish.mutateAsync;
    const unpublishAsync = unpublish.mutateAsync;
    const discardAsync = discard.mutateAsync;

    const publishFn = useCallback(
      (body: ExpectedVersionRequest) =>
        asMutateResult(() => publishAsync(body)),
      [publishAsync],
    );
    const unpublishFn = useCallback(
      (body: ExpectedVersionRequest) =>
        asMutateResult(() => unpublishAsync(body)),
      [unpublishAsync],
    );
    const discardFn = useCallback(
      (body: ExpectedVersionRequest) =>
        asMutateResult(() => discardAsync(body)),
      [discardAsync],
    );

    return {
      publish: publishFn,
      unpublish: unpublishFn,
      discard: discardFn,
    };
  };

  return {
    queryKey: config.queryKey,
    fetch: config.fetch,
    update: config.update,
    setCache: config.setCache,
    useQuery: useEntityQuery,
    useSetCache,
    useLifecycleMutators,
  };
}

export type DraftPublishResource<
  TEntity extends VersionedEntity,
  TParams,
> = ReturnType<typeof createDraftPublishResource<TEntity, TParams>>;
