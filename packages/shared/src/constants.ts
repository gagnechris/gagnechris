/**
 * Cross-workspace constants (API, publisher, OpenAPI schemas, infra).
 * Single source for service names, metrics namespace, and apex domain.
 */

/** Apex zone / site hostname (prod). */
export const APEX_DOMAIN = 'gagnechris.com' as const;

export const POWERTOOLS_METRICS_NAMESPACE = 'gagnechris' as const;
export const API_SERVICE_NAME = 'gagnechris-api' as const;
export const PUBLISHER_SERVICE_NAME = 'gagnechris-publisher' as const;
