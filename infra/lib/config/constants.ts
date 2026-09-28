/**
 * Shared infra constants (not environment-specific).
 * SSM key names are mirrored in `ssm-params.json` for shell scripts.
 */

/** Apex zone / site hostname (must match `environments.ts` DOMAIN_BY_ENV.prod). */
export const APEX_DOMAIN = 'gagnechris.com' as const;

/** Cognito managed-login hostname. */
export const AUTH_DOMAIN = `auth.${APEX_DOMAIN}` as const;

/** Local Vite (and optional CRA) origins for CORS / Cognito callbacks. */
export const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
] as const;

/** Production browser origins (apex only; www redirects to apex). */
export function siteOrigins(apexDomain: string = APEX_DOMAIN): string[] {
  return [`https://${apexDomain}`, ...DEV_ORIGINS];
}

/** CloudWatch EMF / Powertools metrics namespace for all Lambdas. */
export const POWERTOOLS_METRICS_NAMESPACE = 'gagnechris' as const;

export const API_SERVICE_NAME = 'gagnechris-api' as const;
export const PUBLISHER_SERVICE_NAME = 'gagnechris-publisher' as const;

export const GITHUB_OWNER = 'gagnechris' as const;
export const GITHUB_REPO = 'gagnechris' as const;

/**
 * SSM parameter leaf names under `/gagnechris/<env>/`.
 * Keep in sync with `ssm-params.json`.
 */
export const SSM_PARAM_KEYS = {
  siteBucketName: 'site-bucket-name',
  cloudfrontDistributionId: 'cloudfront-distribution-id',
  viewerRequestFunctionName: 'viewer-request-function-name',
  blogSlugsKvsArn: 'blog-slugs-kvs-arn',
  httpApiId: 'http-api-id',
  httpApiUrl: 'http-api-url',
  dataTableName: 'data-table-name',
  dataTableArn: 'data-table-arn',
  dataTableStreamArn: 'data-table-stream-arn',
  cognitoUserPoolId: 'cognito-user-pool-id',
  cognitoWebClientId: 'cognito-web-client-id',
  cognitoAuthDomain: 'cognito-auth-domain',
  publisherFunctionName: 'publisher-function-name',
  publisherFunctionArn: 'publisher-function-arn',
} as const;

export type SsmParamKey = keyof typeof SSM_PARAM_KEYS;

/** Full SSM parameter path, e.g. `/gagnechris/prod/http-api-id`. */
export function ssmParameterName(
  envName: string,
  key: SsmParamKey,
): string {
  return `/gagnechris/${envName}/${SSM_PARAM_KEYS[key]}`;
}
