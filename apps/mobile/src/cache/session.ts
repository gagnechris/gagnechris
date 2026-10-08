import type { QueryClient } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
  type PersistQueryClientOptions,
} from '@tanstack/react-query-persist-client';
import { createCachePersister, type CacheStorage } from './persister';
import { CACHE_MAX_AGE_MS, cacheBuster, shouldPersistQuery } from './policy';

export type CacheSession = {
  queryClient: QueryClient;
  /** Settles once the stored cache is in the query client (or discarded). */
  restored: Promise<void>;
  stop: () => Promise<void>;
};

let active: CacheSession | null = null;

/** The session whose cache sign-out must wipe. */
export const activeCacheSession = () => active;

/** Restores the stored cache, then persists every change until stopped. */
export const startCacheSession = (
  queryClient: QueryClient,
  sub: string,
  storage: CacheStorage,
): CacheSession => {
  const persister = createCachePersister(storage);
  const options: PersistQueryClientOptions = {
    queryClient,
    persister,
    maxAge: CACHE_MAX_AGE_MS,
    buster: cacheBuster(sub),
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  };
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  // A stored cache that is expired, from another schema or another user, or
  // unreadable is removed by the restore.
  const restored = persistQueryClientRestore(options)
    .catch(() => undefined)
    .then(() => {
      if (!stopped) unsubscribe = persistQueryClientSubscribe(options);
    });
  const session: CacheSession = {
    queryClient,
    restored,
    stop: async () => {
      stopped = true;
      unsubscribe?.();
      unsubscribe = null;
      if (active === session) active = null;
      await persister.stop();
    },
  };
  active = session;
  return session;
};
