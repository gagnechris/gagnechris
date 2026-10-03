/**
 * Platform-neutral domain entry for `@gagnechris/shared`.
 * No marked, HTML renderers, OpenAPI, or Node DynamoDB helpers (CHR-139).
 */
export {
  API_SERVICE_NAME,
  APEX_DOMAIN,
  POWERTOOLS_METRICS_NAMESPACE,
  PUBLISHER_SERVICE_NAME,
  RESTORE_TEST_SERVICE_NAME,
} from './constants.js';
export {
  SITE_AUTHOR_NAME,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
  SITE_PROFILE_IMAGE_SRC,
} from './site-config.js';
export * from './schemas.js';
export { DEFAULT_HOME } from './home-default.js';
export { DEFAULT_RESUME } from './resume-default.js';
export { EMPTY_SLUG_FALLBACK, MAX_SLUG_LENGTH, slugify } from './slugify.js';
export { formatPostDate, postDateAttribute } from './post-date.js';
export { textExcerpt } from './excerpt.js';
export { createUlid, type RandomBytes } from './ulid.js';
