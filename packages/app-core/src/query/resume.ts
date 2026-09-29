import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  asMutateResult,
  discardResume,
  fetchResume,
  publishResume,
  unpublishResume,
  updateResume,
  type ExpectedVersionRequest,
  type Resume,
  type UpdateResumeRequest,
} from './api.js';
import { preferNewerByVersion, setCachedResume } from './cache.js';
import { queryKeys } from './keys.js';

export const useResumeQuery = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.resume(),
    queryFn: async () => {
      const fetched = await fetchResume(getClient());
      const cached = queryClient.getQueryData<Resume>(queryKeys.resume());
      return preferNewerByVersion(cached, fetched);
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
};

export const useSetResumeCache = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (resume: Resume) => {
      setCachedResume(queryClient, resume);
    },
    [queryClient],
  );
};

export const useUpdateResumeMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateResumeRequest) => updateResume(getClient(), body),
    onSuccess: (resume) => {
      setCachedResume(queryClient, resume);
    },
  });
};

export const usePublishResumeMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) =>
      publishResume(getClient(), body),
    onSuccess: (resume) => {
      setCachedResume(queryClient, resume);
    },
  });
};

export const useUnpublishResumeMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) =>
      unpublishResume(getClient(), body),
    onSuccess: (resume) => {
      setCachedResume(queryClient, resume);
    },
  });
};

export const useDiscardResumeMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) =>
      discardResume(getClient(), body),
    onSuccess: (resume) => {
      setCachedResume(queryClient, resume);
    },
  });
};

export const useResumeLifecycleMutators = () => {
  const publish = usePublishResumeMutation();
  const unpublish = useUnpublishResumeMutation();
  const discard = useDiscardResumeMutation();

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
