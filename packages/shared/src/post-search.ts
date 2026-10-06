/** Case-insensitive substring match on title, slug or any tag; a blank query matches everything. */
export function postMatchesQuery(
  post: { title: string; slug: string; tags: readonly string[] },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    post.title.toLowerCase().includes(needle) ||
    post.slug.toLowerCase().includes(needle) ||
    post.tags.some((t) => t.toLowerCase().includes(needle))
  );
}
