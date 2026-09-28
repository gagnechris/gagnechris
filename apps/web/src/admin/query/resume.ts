import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
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
} from './api';
import { setCachedResume } from './cache';
import { queryKeys } from './keys';

export const useResumeQuery = () =>
  useQuery({
    queryKey: queryKeys.resume(),
    queryFn: fetchResume,
  });

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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateResumeRequest) => updateResume(body),
    onSuccess: (resume) => {
      setCachedResume(queryClient, resume);
    },
  });
};

export const usePublishResumeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) => publishResume(body),
    onSuccess: (resume) => {
      setCachedResume(queryClient, resume);
    },
  });
};

export const useUnpublishResumeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) => unpublishResume(body),
    onSuccess: (resume) => {
      setCachedResume(queryClient, resume);
    },
  });
};

export const useDiscardResumeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExpectedVersionRequest) => discardResume(body),
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
