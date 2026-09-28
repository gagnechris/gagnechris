/**
 * Publish-relevance helpers aligned with the DynamoDB Streams filter on
 * PublisherStack (`Keys.sk == PUBLISHED`).
 *
 * Local API cannot see stream records; {@link isPublishRelevantAdminMutation}
 * approximates the same moments (publish / unpublish / soft-delete) for
 * triggering `rebuildPublishedSite` after successful admin HTTP calls.
 */

import { SK_PUBLISHED } from './keys.js';

/** Sort key value the publisher stream event source filters on. */
export const PUBLISH_STREAM_SK = SK_PUBLISHED;

export interface DynamoStreamKeyImage {
  readonly sk?: { readonly S?: string };
}

/**
 * True when a stream record's keys match the CDK `FilterRule.isEqual('PUBLISHED')`
 * filter (sk attribute equal to {@link PUBLISH_STREAM_SK}).
 */
export function isPublishRelevant(keys: DynamoStreamKeyImage | undefined): boolean {
  return keys?.sk?.S === PUBLISH_STREAM_SK;
}

/**
 * Local-dev stand-in for {@link isPublishRelevant}: admin routes that create,
 * replace, or remove a PUBLISHED snapshot (CHR-96).
 */
export function isPublishRelevantAdminMutation(
  method: string,
  path: string,
): boolean {
  const normalized = path.replace(/\/$/, '') || '/';
  if (method === 'POST') {
    return (
      (normalized.endsWith('/publish') || normalized.endsWith('/unpublish')) &&
      (normalized.startsWith('/api/admin/posts/') ||
        normalized.startsWith('/api/admin/home') ||
        normalized.startsWith('/api/admin/resume'))
    );
  }
  if (method === 'DELETE' && /^\/api\/admin\/posts\/[^/]+$/.test(normalized)) {
    return true;
  }
  return false;
}
