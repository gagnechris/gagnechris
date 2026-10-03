/**
 * Shared infra constants (not environment-specific).
 * Service names / metrics namespace / apex domain are owned by `@gagnechris/shared`.
 * SSM leaf names come from `ssm-params.json` (also read by deploy-web.sh).
 */
import {
  API_SERVICE_NAME,
  APEX_DOMAIN,
  POWERTOOLS_METRICS_NAMESPACE,
  PUBLISHER_SERVICE_NAME,
  RESTORE_TEST_SERVICE_NAME,
} from '@gagnechris/shared';
import ssmParams from './ssm-params.json' with { type: 'json' };

export {
  API_SERVICE_NAME,
  APEX_DOMAIN,
  POWERTOOLS_METRICS_NAMESPACE,
  PUBLISHER_SERVICE_NAME,
  RESTORE_TEST_SERVICE_NAME,
};

/** Cognito managed-login hostname. */
export const AUTH_DOMAIN = `auth.${APEX_DOMAIN}` as const;

/**
 * Local Vite origin. Only the dev Cognito client trusts it; prod clients and
 * prod CORS never do (CHR-195).
 */
export const DEV_ORIGIN = 'http://localhost:5173' as const;

/** Production browser origins (apex only; www redirects to apex). */
export function siteOrigins(apexDomain: string = APEX_DOMAIN): string[] {
  return [`https://${apexDomain}`];
}

/** Cognito group required on /api/admin/* and /api/notebook/* (CHR-195). */
export const ADMIN_GROUP = 'admin' as const;

export const GITHUB_OWNER = 'gagnechris' as const;
export const GITHUB_REPO = 'gagnechris' as const;

/**
 * SSM parameter leaf names under `/gagnechris/<env>/`.
 * Sourced from `ssm-params.json` (single source for CDK + shell).
 */
export const SSM_PARAM_KEYS = ssmParams.keys;

export type SsmParamKey = keyof typeof SSM_PARAM_KEYS;

/** Full SSM parameter path, e.g. `/gagnechris/prod/http-api-id`. */
export function ssmParameterName(envName: string, key: SsmParamKey): string {
  const prefix = ssmParams.prefixTemplate.replaceAll('${ENV_NAME}', envName);
  return `${prefix}/${SSM_PARAM_KEYS[key]}`;
}
