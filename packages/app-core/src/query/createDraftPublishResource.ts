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

/**
 * Versioned resource plus publish / unpublish / discard mutators for post /
 * home / resume. Non-publishable entities use `createVersionedResource` alone
 * (CHR-173).
 */
export function createDraftPublishResource<
  TEntity extends VersionedEntity,
  TParams,
>(config: DraftPublishResourceConfig<TEntity, TParams>) {
  const base = createVersionedResource(config);

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
    ...base,
    useLifecycleMutators,
  };
}

export type DraftPublishResource<
  TEntity extends VersionedEntity,
  TParams,
> = ReturnType<typeof createDraftPublishResource<TEntity, TParams>>;
