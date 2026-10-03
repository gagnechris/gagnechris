/**
 * Must stay aligned with the PublisherStack stream filter (`Keys.sk == PUBLISHED`).
 * Admin route prefixes are generated from publisher targets.
 */

import { SK_PUBLISHED } from './keys.js';
import {
  PUBLISH_ADMIN_MUTATION_PREFIXES,
  PUBLISH_ADMIN_SOFT_DELETE_PREFIXES,
} from './publish-admin-routes.generated.js';

export const PUBLISH_STREAM_SK = SK_PUBLISHED;

export interface DynamoStreamKeyImage {
  readonly sk?: { readonly S?: string };
}

export function isPublishRelevant(
  keys: DynamoStreamKeyImage | undefined,
): boolean {
  return keys?.sk?.S === PUBLISH_STREAM_SK;
}

function startsWithAny(path: string, prefixes: readonly string[]): boolean {
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(prefix + '/')) {
      return true;
    }
  }
  return false;
}

/** Local API cannot see stream records, so this approximates {@link isPublishRelevant}. */
export function isPublishRelevantAdminMutation(
  method: string,
  path: string,
): boolean {
  const normalized = path.replace(/\/$/, '') || '/';
  if (method === 'POST') {
    if (
      !normalized.endsWith('/publish') &&
      !normalized.endsWith('/unpublish')
    ) {
      return false;
    }
    return startsWithAny(normalized, PUBLISH_ADMIN_MUTATION_PREFIXES);
  }
  if (method === 'DELETE') {
    for (const prefix of PUBLISH_ADMIN_SOFT_DELETE_PREFIXES) {
      const re = new RegExp(
        `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+$`,
      );
      if (re.test(normalized)) return true;
    }
  }
  return false;
}
