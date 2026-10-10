import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  fetchDailyTemplate,
  resetDailyTemplate,
  updateDailyTemplate,
  type DailyTemplate,
  type NotebookArea,
} from './api.js';
import { setDetail } from './cache.js';
import { createVersionedResource } from './createVersionedResource.js';
import { queryKeys } from './keys.js';

export type DailyTemplateResourceParams = { area: NotebookArea };

const setCachedTemplate = (
  queryClient: Parameters<typeof setDetail>[0],
  template: DailyTemplate,
) => {
  setDetail(queryClient, queryKeys.dailyTemplate(template.area), template);
  // Empty days carry the template filled in; refetch them from the new one.
  void queryClient.invalidateQueries({
    queryKey: [...queryKeys.notes.all, 'daily'],
  });
};

export const dailyTemplateResource = createVersionedResource<
  DailyTemplate,
  DailyTemplateResourceParams
>({
  queryKey: ({ area }) => queryKeys.dailyTemplate(area),
  fetch: (client, { area }) => fetchDailyTemplate(client, area),
  update: (client, { area }, body) =>
    updateDailyTemplate(client, area, {
      version: body.version,
      bodyMarkdown: String(body.bodyMarkdown ?? ''),
    }),
  setCache: setCachedTemplate,
  tooLargeMessage: 'This template is over the 10 KB limit.',
});

/** Resets from the cached version, so call it after any pending save settles. */
export const useResetDailyTemplateMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (area: NotebookArea) =>
      resetDailyTemplate(
        getClient(),
        area,
        queryClient.getQueryData<DailyTemplate>(queryKeys.dailyTemplate(area))
          ?.version ?? 0,
      ),
    onSuccess: (template) => setCachedTemplate(queryClient, template),
  });
};
