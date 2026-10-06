type Page<T> = { items: T[]; nextCursor?: string };

/** Reads pages until they run out or `max` items pass `keep`; returns at most `max`. */
export async function collectPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  max: number,
  keep: (item: T) => boolean = () => true,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    for (const item of page.items) if (keep(item)) items.push(item);
    cursor = page.nextCursor;
  } while (cursor && items.length < max);
  return items.slice(0, max);
}
