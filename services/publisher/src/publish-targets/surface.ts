import type { PublishTarget } from './types.js';

/**
 * Vite-built public pages that are not publisher targets: one per
 * `STATIC_PAGE_META` entry in apps/web/scripts/staticPageMeta.ts.
 */
export const STATIC_OPTION_B_PAGES = [
  '/contact',
  '/dont-feed-the-bears',
  '/dont-feed-the-bears/camp',
  '/dont-feed-the-bears/wild',
] as const;

export function collectOptionBPaths(
  targets: readonly PublishTarget[],
): string[] {
  const paths = new Set<string>();
  for (const target of targets) {
    for (const path of target.optionBPaths ?? []) {
      paths.add(path);
    }
  }
  return [...paths].sort();
}

export function collectAdminMutationPrefixes(
  targets: readonly PublishTarget[],
): string[] {
  const prefixes = new Set<string>();
  for (const target of targets) {
    for (const prefix of target.adminMutationPrefixes ?? []) {
      prefixes.add(prefix);
    }
  }
  return [...prefixes].sort();
}

export function collectAdminSoftDeletePrefixes(
  targets: readonly PublishTarget[],
): string[] {
  const prefixes = new Set<string>();
  for (const target of targets) {
    if (!target.adminSoftDelete) continue;
    for (const prefix of target.adminMutationPrefixes ?? []) {
      prefixes.add(prefix);
    }
  }
  return [...prefixes].sort();
}

export function allOptionBPages(targets: readonly PublishTarget[]): string[] {
  return [
    ...new Set([...collectOptionBPaths(targets), ...STATIC_OPTION_B_PAGES]),
  ].sort();
}
