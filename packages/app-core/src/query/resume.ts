import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  discardResume,
  fetchResume,
  publishResume,
  unpublishResume,
  updateResume,
  type ExpectedVersionRequest,
  type Resume,
  type UpdateResumeRequest,
} from './api.js';
import { setCachedResume } from './cache.js';
import { createDraftPublishResource } from './createDraftPublishResource.js';
import { queryKeys } from './keys.js';

export type ResumeResourceParams = Record<string, never>;

export const resumeResource = createDraftPublishResource<
  Resume,
  ResumeResourceParams
>({
  queryKey: () => queryKeys.resume(),
  fetch: (client) => fetchResume(client),
  update: (client, _params, body) =>
    updateResume(client, body as UpdateResumeRequest),
  publish: (client, _params, body) => publishResume(client, body),
  unpublish: (client, _params, body) => unpublishResume(client, body),
  discard: (client, _params, body) => discardResume(client, body),
  setCache: setCachedResume,
});

export const useResumeQuery = () => resumeResource.useQuery({});

export const useSetResumeCache = resumeResource.useSetCache;

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

export const useResumeLifecycleMutators = () =>
  resumeResource.useLifecycleMutators({});
