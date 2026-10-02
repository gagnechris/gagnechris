import {
  discardResume,
  fetchResume,
  publishResume,
  unpublishResume,
  updateResume,
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
