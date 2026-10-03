// Requires scripts/local/env.sh sourced.
import { rebuildPublishedSite } from '@gagnechris/publisher/s3-site';

const result = await rebuildPublishedSite();
console.log('[local] rebuild', result);
