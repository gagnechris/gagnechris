import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  asMutateResult,
  discardHome,
  fetchHome,
  publishHome,
  unpublishHome,
  updateHome,
  type ExpectedVersionRequest,
  type Home,
  type UpdateHomeRequest,
} from './api.js';
import { setCachedHome } from './cache.js';
import { queryKeys } from './keys.js';

export const useHomeQuery = () => {
  const getClient = useGetApiClient();
  return useQuery({
    queryKey: queryKeys.home(),
    queryFn: () => fetchHome(getClient()),
  });
};

export const useSetHomeCache = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (home: Home) => {
      setCachedHome(queryClient, home);
    },
    [queryClient],
  );
};

export const useUpdateHomeMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateHomeRequest) => updateHome(getClient(), body),
    onSuccess: (home) => {
      setCachedHome(queryClient, home);
    },
  });
};

export const usePublishHomeMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) =>
      publishHome(getClient(), body),
    onSuccess: (home) => {
      setCachedHome(queryClient, home);
    },
  });
};

export const useUnpublishHomeMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) =>
      unpublishHome(getClient(), body),
    onSuccess: (home) => {
      setCachedHome(queryClient, home);
    },
  });
};

export const useDiscardHomeMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) =>
      discardHome(getClient(), body),
    onSuccess: (home) => {
      setCachedHome(queryClient, home);
    },
  });
};

export const useHomeLifecycleMutators = () => {
  const publish = usePublishHomeMutation();
  const unpublish = useUnpublishHomeMutation();
  const discard = useDiscardHomeMutation();

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
