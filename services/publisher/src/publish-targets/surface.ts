/**
 * Publish-surface helpers derived from registered targets (CHR-179).
 * Codegen (`scripts/generate-publish-surface.ts`) emits CloudFront Option B
 * prefixes and local-dev admin mutation routes from these collectors so a new
 * page only needs a target file + registry entry.
 */

import type { PublishTarget } from './types.js';

/** Vite-built public pages that are not publisher targets. */
export const STATIC_OPTION_B_PREFIXES = [
  '/contact',
  '/dont-feed-the-bears',
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

/** All Option B prefixes: publisher-owned + static Vite pages. */
export function allOptionBPrefixes(
  targets: readonly PublishTarget[],
): string[] {
  return [
    ...new Set([
      ...collectOptionBPaths(targets),
      ...STATIC_OPTION_B_PREFIXES,
    ]),
  ].sort();
}
