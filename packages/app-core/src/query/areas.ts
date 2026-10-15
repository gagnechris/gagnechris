import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_NOTEBOOK_AREAS } from '@gagnechris/shared';
import { useGetApiClient } from '../AppApiProvider.js';
import {
  fetchNotebookAreas,
  updateNotebookAreas,
  type NotebookAreaEntry,
  type NotebookAreas,
} from './api.js';
import { queryKeys } from './keys.js';

export const useNotebookAreasQuery = () => {
  const getClient = useGetApiClient();
  return useQuery({
    queryKey: queryKeys.notebookAreas(),
    queryFn: () => fetchNotebookAreas(getClient()),
  });
};

/** The user's areas; Work and Personal until the list loads, which is what an unsaved list is. */
export const useNotebookAreas = (): readonly NotebookAreaEntry[] =>
  useNotebookAreasQuery().data?.areas ?? DEFAULT_NOTEBOOK_AREAS;

/** Saves the whole list on the cached version; a stale one is a conflict. */
export const useSaveNotebookAreasMutation = () => {
  const getClient = useGetApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (areas: NotebookAreaEntry[]) =>
      updateNotebookAreas(getClient(), {
        version:
          queryClient.getQueryData<NotebookAreas>(queryKeys.notebookAreas())
            ?.version ?? 0,
        areas,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.notebookAreas(), saved);
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notebookAreas(),
      });
    },
  });
};
