/**
 * Rebuild publisher output into SITE_BUCKET_NAME (filesystem local).
 * Requires scripts/local/env.sh sourced (or equivalent).
 */
import { rebuildPublishedSite } from '@gagnechris/publisher/s3-site';

const result = await rebuildPublishedSite();
console.log('[local] rebuild', result);
