/** One entry per id, keeping the highest version: lists can overlap mid-refetch. */
export function newestById<T extends { id: string; version: number }>(
  items: Iterable<T>,
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const item of items) {
    const seen = byId.get(item.id);
    if (!seen || item.version > seen.version) byId.set(item.id, item);
  }
  return byId;
}
