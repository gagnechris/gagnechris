import type { KeyValueStore } from '../area';

/** Per user like everything in AsyncStorage, so sign-out's clear wipes it. */
export const RECENT_SEARCHES_KEY = 'gagnechris.notebook.recentSearches';
const MAX_RECENT = 8;

export async function readRecentSearches(
  store: KeyValueStore,
): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(
      (await store.getItem(RECENT_SEARCHES_KEY)) ?? '[]',
    );
    return Array.isArray(parsed)
      ? parsed.filter((q): q is string => typeof q === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Newest first; repeating a search moves it to the top. */
export const withRecentSearch = (recent: readonly string[], q: string) => {
  const query = q.trim();
  if (!query) return [...recent];
  return [
    query,
    ...recent.filter((r) => r.toLowerCase() !== query.toLowerCase()),
  ].slice(0, MAX_RECENT);
};

export const writeRecentSearches = (
  store: KeyValueStore,
  recent: readonly string[],
) =>
  store.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent)).catch(() => {
    // Not persisted; the list still holds for this run.
  });
