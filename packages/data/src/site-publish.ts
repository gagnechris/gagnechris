/**
 * The site publish row, updated in the same transaction as every `PUBLISHED`
 * write or delete. Its sk is not `PUBLISHED`, so it never reaches the
 * publisher stream. `generation` changes on every publish-side commit; the id
 * sets name the posts and projects that have a `PUBLISHED` row, readable with
 * `ConsistentRead` where GSI1 is only eventually consistent.
 */
export type SitePublishState = {
  generation: number;
  postIds: string[];
  projectIds: string[];
};

const idList = (value: unknown): string[] =>
  value instanceof Set || Array.isArray(value)
    ? [...(value as Iterable<unknown>)]
        .filter((id): id is string => typeof id === 'string' && id !== '')
        .sort()
    : [];

/** A missing row reads as generation 0 with no ids. */
export function parseSitePublishItem(
  item: Record<string, unknown> | undefined,
): SitePublishState {
  const generation = item?.generation;
  return {
    generation: typeof generation === 'number' ? generation : 0,
    postIds: idList(item?.postIds),
    projectIds: idList(item?.projectIds),
  };
}
