import { RemovalPolicy } from 'aws-cdk-lib';
import { APEX_DOMAIN } from './constants.js';

export const ENVIRONMENT_NAMES = ['prod'] as const;

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

/** No staging: cost and DNS collision risk. */
export const ACTIVE_ENVIRONMENT: EnvironmentName = 'prod';

export const STACK_REGION = 'us-east-1' as const;

export interface EnvironmentConfig {
  readonly name: EnvironmentName;
  readonly account: string;
  readonly region: typeof STACK_REGION;
  readonly domainName: string;
  readonly statefulRemovalPolicy: RemovalPolicy;
  /** Never commit the value. */
  readonly alertsEmail: string;
  /** Cognito username added to the `admin` group. Never commit it. */
  readonly adminUsername: string;
}

const DOMAIN_BY_ENV: Record<EnvironmentName, string> = {
  prod: APEX_DOMAIN,
};

export function resolveAccountId(env: NodeJS.ProcessEnv = process.env): string {
  const account = env.CDK_ACCOUNT ?? env.CDK_DEFAULT_ACCOUNT;
  if (!account) {
    throw new Error(
      'AWS account unresolved. Set CDK_ACCOUNT, or run with AWS credentials so the CDK CLI sets CDK_DEFAULT_ACCOUNT.',
    );
  }
  return account;
}

export function resolveAlertsEmail(
  contextValue: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv = env.ALERTS_EMAIL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (typeof contextValue === 'string' && contextValue.trim().length > 0) {
    return contextValue.trim();
  }
  throw new Error(
    'Alerts email unresolved. Set ALERTS_EMAIL or pass -c alertsEmail=you@example.com.',
  );
}

export function parseEnvironmentName(raw: unknown): EnvironmentName {
  const value = typeof raw === 'string' ? raw : ACTIVE_ENVIRONMENT;
  if ((ENVIRONMENT_NAMES as readonly string[]).includes(value)) {
    return value as EnvironmentName;
  }
  throw new Error(
    `Unknown env "${String(raw)}". Expected: ${ENVIRONMENT_NAMES.join(', ')}. Pass -c env=prod (or omit).`,
  );
}

export function getEnvironment(
  name: EnvironmentName = ACTIVE_ENVIRONMENT,
  env: NodeJS.ProcessEnv = process.env,
  alertsEmailContext?: unknown,
): EnvironmentConfig {
  const alertsEmail = resolveAlertsEmail(alertsEmailContext, env);
  return {
    name,
    account: resolveAccountId(env),
    region: STACK_REGION,
    domainName: DOMAIN_BY_ENV[name],
    statefulRemovalPolicy: RemovalPolicy.RETAIN,
    alertsEmail,
    adminUsername: env.ADMIN_USERNAME?.trim() || alertsEmail,
  };
}
