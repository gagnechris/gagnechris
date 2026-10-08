import { queryKeys } from '@gagnechris/app-core';
import { QueryClient, type Query, type QueryKey } from '@tanstack/react-query';

/** Bump when a persisted query's data shape changes; old caches are dropped. */
export const CACHE_SCHEMA_VERSION = 1;

/** The longest a session lasts, so a cache never outlives the sign-in. */
export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const CACHE_STORAGE_KEY = 'gagnechris.queryCache';

export const cacheBuster = (
  sub: string,
  schemaVersion: number = CACHE_SCHEMA_VERSION,
) => `${schemaVersion}:${sub}`;

const notebookRoots: readonly QueryKey[] = [
  queryKeys.notes.all,
  queryKeys.tasks.all,
];

// `daily-dates` holds a Set, which JSON turns into `{}`.
const persistedKinds = new Set(['list', 'detail', 'batch', 'daily']);

const hasSearchTerm = (filters: unknown) =>
  typeof filters === 'object' &&
  filters !== null &&
  'q' in filters &&
  typeof filters.q === 'string' &&
  filters.q.trim() !== '';

export const isPersistedQueryKey = (key: QueryKey): boolean => {
  const root = notebookRoots.find((prefix) =>
    prefix.every((part, i) => key[i] === part),
  );
  if (!root) return false;
  const kind = key[root.length];
  if (typeof kind !== 'string' || !persistedKinds.has(kind)) return false;
  return !hasSearchTerm(key[root.length + 1]);
};

// A refetch that fails (server unreachable while NetInfo says connected) leaves
// the query in `error` with its data; persisting only `success` would delete
// the saved copy on the next write.
export const shouldPersistQuery = (query: Query): boolean =>
  query.state.data !== undefined && isPersistedQueryKey(query.queryKey);

export const createAppQueryClient = () => {
  const queryClient = new QueryClient();
  // An unused query is collected after gcTime and then drops out of the next
  // persist, so persisted ones must live as long as the cache.
  for (const root of notebookRoots) {
    queryClient.setQueryDefaults(root, { gcTime: CACHE_MAX_AGE_MS });
  }
  return queryClient;
};
