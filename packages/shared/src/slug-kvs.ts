/**
 * The viewer-request KeyValueStore allowlists post slugs as bare keys and
 * project slugs as `projects/<slug>`. Each namespace fails open until its
 * sentinel key exists.
 */
export const POST_SLUG_KVS_SYNCED_KEY = '__synced__';
export const PROJECT_SLUG_KVS_PREFIX = 'projects/';
export const PROJECT_SLUG_KVS_SYNCED_KEY = `${PROJECT_SLUG_KVS_PREFIX}__synced__`;
