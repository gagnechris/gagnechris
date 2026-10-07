// Requires scripts/local/env.sh sourced.
import { rebuildPublishedSite } from '@gagnechris/publisher/rebuild';

const result = await rebuildPublishedSite();
console.log('[local] rebuild', result);
