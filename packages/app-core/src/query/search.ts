import type { NotebookSearchHit } from '@gagnechris/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useGetApiClient } from '../AppApiProvider.js';
import { searchNotebook, type NotebookSearchQuery, type Task } from './api.js';
import { queryKeys } from './keys.js';
import { useCachedTasks } from './tasks.js';

export const SEARCH_DEBOUNCE_MS = 200;

export const useNotebookSearchQuery = (
  filters: NotebookSearchQuery,
  enabled = true,
  keepPrevious = false,
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
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  });
};

export type LiveTaskHit = {
  hit: NotebookSearchHit;
  /** The cached task when there is one, so a check-off shows at once. */
  live: Pick<Task, 'id' | 'title' | 'status' | 'version'> | undefined;
};

/**
 * Search as the user types: one request once typing pauses, the previous
 * results kept until the new ones arrive, and task hits merged with the
 * cached tasks.
 */
export function useDebouncedNotebookSearch(
  q: string,
  filters: Omit<NotebookSearchQuery, 'q'>,
) {
  const [query, setQuery] = useState(q);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const searching = q.trim().length > 0;
  const search = useNotebookSearchQuery(
    { ...filters, q: query },
    searching,
    true,
  );
  const data = searching ? search.data : undefined;
  const taskHits = data?.tasks;
  const taskIds = useMemo(() => (taskHits ?? []).map((t) => t.id), [taskHits]);
  const cached = useCachedTasks(taskIds);
  const tasks: LiveTaskHit[] = (taskHits ?? []).map((hit, i) => {
    const task = cached[i]?.data;
    return {
      hit,
      live:
        task && !task.deleted
          ? task
          : hit.status !== undefined && hit.version !== undefined
            ? {
                id: hit.id,
                title: hit.title,
                status: hit.status,
                version: hit.version,
              }
            : undefined,
    };
  });

  const typing = q.trim() !== query.trim();
  return {
    /** The text the results are for. */
    query,
    notes: data?.notes ?? [],
    tasks,
    /** The notebook held more than one search reads; the oldest went unsearched. */
    truncated: data?.truncated ?? false,
    isError: searching && search.isError,
    /** Waiting on typing to pause or on the request. */
    pending: searching && (typing || search.isFetching),
  };
}
