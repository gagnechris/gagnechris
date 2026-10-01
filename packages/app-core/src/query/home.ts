import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import {
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
import { createDraftPublishResource } from './createDraftPublishResource.js';
import { queryKeys } from './keys.js';

export type HomeResourceParams = Record<string, never>;

export const homeResource = createDraftPublishResource<
  Home,
  HomeResourceParams
>({
  queryKey: () => queryKeys.home(),
  fetch: (client) => fetchHome(client),
  update: (client, _params, body) =>
    updateHome(client, body as UpdateHomeRequest),
  publish: (client, _params, body) => publishHome(client, body),
  unpublish: (client, _params, body) => unpublishHome(client, body),
  discard: (client, _params, body) => discardHome(client, body),
  setCache: setCachedHome,
});

export const useHomeQuery = () => homeResource.useQuery({});

export const useSetHomeCache = homeResource.useSetCache;

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

export const useHomeLifecycleMutators = () =>
  homeResource.useLifecycleMutators({});
