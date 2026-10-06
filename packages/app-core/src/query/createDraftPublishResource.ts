import type { ApiClient } from '@gagnechris/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  asMutateResult,
  type ExpectedVersionRequest,
  type MutateResult,
} from './api.js';
import {
  createVersionedResource,
  type VersionedEntity,
  type VersionedResourceConfig,
} from './createVersionedResource.js';

export type { VersionedEntity } from './createVersionedResource.js';

export type DraftPublishResourceConfig<
  TEntity extends VersionedEntity,
  TParams,
> = VersionedResourceConfig<TEntity, TParams> & {
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
};

export type DraftPublishLifecycleMutators<TEntity> = {
  publish: (body: ExpectedVersionRequest) => Promise<MutateResult<TEntity>>;
  unpublish: (body: ExpectedVersionRequest) => Promise<MutateResult<TEntity>>;
  discard: (body: ExpectedVersionRequest) => Promise<MutateResult<TEntity>>;
};

/** Non-publishable entities use `createVersionedResource` alone. */
export function createDraftPublishResource<
  TEntity extends VersionedEntity,
  TParams,
>(config: DraftPublishResourceConfig<TEntity, TParams>) {
  const base = createVersionedResource(config);

  type LifecycleRequest = DraftPublishResourceConfig<
    TEntity,
    TParams
  >['publish'];

  const useLifecycleMutator = (request: LifecycleRequest, params: TParams) => {
    const getClient = useGetApiClient();
    const queryClient = useQueryClient();
    const { mutateAsync } = useMutation({
      mutationFn: (body: ExpectedVersionRequest) =>
        request(getClient(), params, body),
      onSuccess: (entity) => {
        config.setCache(queryClient, entity);
      },
    });
    return useCallback(
      (body: ExpectedVersionRequest) => asMutateResult(() => mutateAsync(body)),
      [mutateAsync],
    );
  };

  const useLifecycleMutators = (
    params: TParams,
  ): DraftPublishLifecycleMutators<TEntity> => ({
    publish: useLifecycleMutator(config.publish, params),
    unpublish: useLifecycleMutator(config.unpublish, params),
    discard: useLifecycleMutator(config.discard, params),
  });

  return {
    ...base,
    useLifecycleMutators,
  };
}

export type DraftPublishResource<
  TEntity extends VersionedEntity,
  TParams,
> = ReturnType<typeof createDraftPublishResource<TEntity, TParams>>;
