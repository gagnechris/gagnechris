export const MAX_PAWS = 3;

/** Paws kept as `used` climbs toward the `limit` that ends the round. */
export function pawsLeft(used: number, limit: number): number {
  return Math.round((MAX_PAWS * Math.max(0, limit - used)) / limit);
}
