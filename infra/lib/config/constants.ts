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

export const AUTH_DOMAIN = `auth.${APEX_DOMAIN}` as const;

/** Only the dev Cognito client trusts this; prod clients and prod CORS never do. */
export const DEV_ORIGIN = 'http://localhost:5173' as const;

/** Apex only: www redirects to apex. */
export function siteOrigins(apexDomain: string = APEX_DOMAIN): string[] {
  return [`https://${apexDomain}`];
}

export const ADMIN_GROUP = 'admin' as const;

export const GITHUB_OWNER = 'gagnechris' as const;
export const GITHUB_REPO = 'gagnechris' as const;

/** JSON so shell scripts read the same names. */
export const SSM_PARAM_KEYS = ssmParams.keys;

export type SsmParamKey = keyof typeof SSM_PARAM_KEYS;

export function ssmParameterName(envName: string, key: SsmParamKey): string {
  const prefix = ssmParams.prefixTemplate.replaceAll('${ENV_NAME}', envName);
  return `${prefix}/${SSM_PARAM_KEYS[key]}`;
}
