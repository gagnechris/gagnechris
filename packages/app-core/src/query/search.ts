import { useQuery } from '@tanstack/react-query';
import { useGetApiClient } from '../AppApiProvider.js';
import { searchNotebook, type NotebookSearchQuery } from './api.js';
import { queryKeys } from './keys.js';

export const useNotebookSearchQuery = (
  filters: NotebookSearchQuery,
  enabled = true,
) => {
  const getClient = useGetApiClient();
  const q = filters.q.trim();
  return useQuery({
    queryKey: queryKeys.search({
      q,
      area: filters.area,
      limit: filters.limit,
    }),
    queryFn: () =>
      searchNotebook(getClient(), {
        ...filters,
        q,
      }),
    enabled: enabled && q.length > 0,
    staleTime: 15_000,
  });
};
