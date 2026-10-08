import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Persister } from '@tanstack/react-query-persist-client';
import { CACHE_STORAGE_KEY } from './policy';

export type CacheStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export type CachePersister = Persister & {
  /** Drops every later write; resolves once writes already sent have landed. */
  stop: () => Promise<void>;
};

export const createCachePersister = (storage: CacheStorage): CachePersister => {
  let stopped = false;
  const writes = new Set<Promise<void>>();
  // The throttle holds a snapshot of the cache, so a write can fire after the
  // subscription is gone; the gate sits on the storage to catch it.
  const gated: CacheStorage = {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      if (stopped) return Promise.resolve();
      const write = storage.setItem(key, value);
      writes.add(write);
      void write.finally(() => writes.delete(write)).catch(() => {});
      return write;
    },
    removeItem: (key) => storage.removeItem(key),
  };
  const persister = createAsyncStoragePersister({
    storage: gated,
    key: CACHE_STORAGE_KEY,
    throttleTime: 1000,
  });
  return {
    ...persister,
    stop: async () => {
      stopped = true;
      await Promise.allSettled([...writes]);
    },
  };
};
