import {
  API_METRICS,
  API_SERVICE_NAME,
  APEX_DOMAIN,
  NOTEBOOK_GROUP,
  POWERTOOLS_METRICS_NAMESPACE,
  PUBLISHER_SERVICE_NAME,
  RESTORE_TEST_METRICS,
  RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES,
  RESTORE_TEST_SERVICE_NAME,
  SITE_ADMIN_GROUP,
  USER_ADMIN_GROUP,
} from '@gagnechris/shared';
import ssmParams from './ssm-params.json' with { type: 'json' };

export {
  API_METRICS,
  API_SERVICE_NAME,
  APEX_DOMAIN,
  NOTEBOOK_GROUP,
  POWERTOOLS_METRICS_NAMESPACE,
  PUBLISHER_SERVICE_NAME,
  RESTORE_TEST_METRICS,
  RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES,
  RESTORE_TEST_SERVICE_NAME,
  SITE_ADMIN_GROUP,
  USER_ADMIN_GROUP,
};

export const AUTH_DOMAIN = `auth.${APEX_DOMAIN}` as const;

export const ADMIN_HOST = `admin.${APEX_DOMAIN}` as const;
export const NOTEBOOK_HOST = `notebook.${APEX_DOMAIN}` as const;

/** Only the dev Cognito client trusts these; prod clients and prod CORS never do. */
export const DEV_ORIGIN = 'http://localhost:5173' as const;
export const DEV_ADMIN_ORIGIN = 'http://localhost:5174' as const;
export const DEV_NOTEBOOK_ORIGIN = 'http://localhost:5175' as const;

/** Apex only: www redirects to apex. */
export function siteOrigins(apexDomain: string = APEX_DOMAIN): string[] {
  return [`https://${apexDomain}`];
}

export const GITHUB_OWNER = 'gagnechris' as const;
export const GITHUB_REPO = 'gagnechris' as const;

/** JSON so shell scripts read the same names. */
export const SSM_PARAM_KEYS = ssmParams.keys;

export type SsmParamKey = keyof typeof SSM_PARAM_KEYS;

export function ssmParameterName(envName: string, key: SsmParamKey): string {
  const prefix = ssmParams.prefixTemplate.replaceAll('${ENV_NAME}', envName);
  return `${prefix}/${SSM_PARAM_KEYS[key]}`;
}
