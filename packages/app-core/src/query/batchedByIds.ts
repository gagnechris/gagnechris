import { useMemo } from 'react';
import {
  useQueries,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { NOTEBOOK_BATCH_MAX_IDS } from '@gagnechris/shared';
import { ApiError } from './api.js';
import { setDetail } from './cache.js';

export type ByIdResult<T> = { data: T | undefined; error: unknown };

type Entity = { id: string; version: number };

/**
 * Detail-cache reads that never fetch on their own; they rerender on every
 * cache write. The query function is real because other observers of the
 * same detail key (the entity's page) may refetch through it.
 */
export function useCachedDetails<T extends Entity>(
  ids: readonly string[],
  detailKey: (id: string) => QueryKey,
  fetchOne: (id: string) => Promise<T>,
) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: detailKey(id),
      queryFn: () => fetchOne(id),
      enabled: false,
    })),
  });
}

/**
 * One batch request for every id (refetched as one on focus or after a
 * write), which seeds the detail caches the results read from. An id the
 * batch leaves out reports a 404, as its GET would.
 */
export function useBatchedByIds<T extends Entity>(
  ids: readonly string[],
  {
    skip,
    batchKey,
    detailKey,
    fetchBatch,
    fetchOne,
    notFound,
  }: {
    skip?: ReadonlySet<string>;
    batchKey: (ids: readonly string[]) => QueryKey;
    detailKey: (id: string) => QueryKey;
    fetchBatch: (ids: readonly string[]) => Promise<T[]>;
    fetchOne: (id: string) => Promise<T>;
    notFound: string;
  },
): ByIdResult<T>[] {
  const queryClient = useQueryClient();
  const wanted = useMemo(
    () => [...new Set(ids.filter((id) => !skip?.has(id)))].sort(),
    [ids, skip],
  );
  const batch = useQuery({
    queryKey: batchKey(wanted),
    queryFn: async (): Promise<string[]> => {
      const found: string[] = [];
      for (let i = 0; i < wanted.length; i += NOTEBOOK_BATCH_MAX_IDS) {
        const chunk = wanted.slice(i, i + NOTEBOOK_BATCH_MAX_IDS);
        for (const entity of await fetchBatch(chunk)) {
          setDetail(queryClient, detailKey(entity.id), entity);
          found.push(entity.id);
        }
      }
      return found;
    },
    enabled: wanted.length > 0,
  });
  const cached = useCachedDetails(ids, detailKey, fetchOne);
  const found = useMemo(() => new Set(batch.data), [batch.data]);
  return ids.map((id, i) => {
    const data = cached[i]?.data;
    if (data) return { data, error: null };
    if (batch.data && !skip?.has(id) && !found.has(id)) {
      return {
        data: undefined,
        error: new ApiError(notFound, 404, 'not_found'),
      };
    }
    return { data: undefined, error: batch.error };
  });
}
