/**
 * Publish-relevance helpers aligned with the DynamoDB Streams filter on
 * PublisherStack (`Keys.sk == PUBLISHED`).
 *
 * Local API cannot see stream records; {@link isPublishRelevantAdminMutation}
 * approximates the same moments (publish / unpublish / soft-delete) for
 * triggering `rebuildPublishedSite` after successful admin HTTP calls.
 *
 * Admin route prefixes are generated from publisher target metadata
 * (`scripts/generate-publish-surface.ts`) so a new page only needs a target
 * file + registry entry (CHR-179).
 */

import { SK_PUBLISHED } from './keys.js';
import {
  PUBLISH_ADMIN_MUTATION_PREFIXES,
  PUBLISH_ADMIN_SOFT_DELETE_PREFIXES,
} from './publish-admin-routes.generated.js';

/** Sort key value the publisher stream event source filters on. */
export const PUBLISH_STREAM_SK = SK_PUBLISHED;

export interface DynamoStreamKeyImage {
  readonly sk?: { readonly S?: string };
}

/**
 * True when a stream record's keys match the CDK `FilterRule.isEqual('PUBLISHED')`
 * filter (sk attribute equal to {@link PUBLISH_STREAM_SK}).
 */
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

/**
 * Local-dev stand-in for {@link isPublishRelevant}: admin routes that create,
 * replace, or remove a PUBLISHED snapshot (CHR-96 / CHR-179).
 */
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
      // DELETE /api/admin/posts/:id — one segment after the prefix.
      const re = new RegExp(
        `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+$`,
      );
      if (re.test(normalized)) return true;
    }
  }
  return false;
}
