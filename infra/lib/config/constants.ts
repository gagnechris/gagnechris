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
} from '@gagnechris/shared';
import ssmParams from './ssm-params.json' with { type: 'json' };

export {
  API_SERVICE_NAME,
  APEX_DOMAIN,
  POWERTOOLS_METRICS_NAMESPACE,
  PUBLISHER_SERVICE_NAME,
};

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
  return `/gagnechris/${envName}/${SSM_PARAM_KEYS[key]}`;
}
