import { RemovalPolicy } from 'aws-cdk-lib';

export const ENVIRONMENT_NAMES = ['staging', 'prod'] as const;

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

/** Environments we actually synthesize/deploy today. Staging is typed and
 * selectable via `-c env=staging` but not used by default (cost). */
export const ACTIVE_ENVIRONMENT: EnvironmentName = 'prod';

export interface EnvironmentConfig {
  readonly name: EnvironmentName;
  /** AWS account ID — resolved from the environment, never committed. */
  readonly account: string;
  readonly region: string;
  /** Apex or site hostname for this environment. */
  readonly domainName: string;
  /** Removal policy for stateful resources (buckets, tables, user pools). */
  readonly statefulRemovalPolicy: RemovalPolicy;
  /**
   * Email for SNS alerts and AWS Budgets notifications.
   * From `ALERTS_EMAIL` or CDK context `alertsEmail` — never commit the value.
   */
  readonly alertsEmail: string;
}

const DOMAIN_BY_ENV: Record<EnvironmentName, string> = {
  staging: 'staging.gagnechris.com',
  prod: 'gagnechris.com',
};

/**
 * Resolve the target AWS account without committing it to the repo.
 * Prefer `CDK_ACCOUNT`; otherwise use `CDK_DEFAULT_ACCOUNT` (set by the CDK CLI
 * when credentials are available).
 */
export function resolveAccountId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const account = env.CDK_ACCOUNT ?? env.CDK_DEFAULT_ACCOUNT;
  if (!account) {
    throw new Error(
      'AWS account unresolved. Set CDK_ACCOUNT, or run with AWS credentials so the CDK CLI sets CDK_DEFAULT_ACCOUNT.',
    );
  }
  return account;
}

/**
 * Resolve the alerts inbox without committing it.
 * Prefer `ALERTS_EMAIL`; otherwise CDK context `-c alertsEmail=...`.
 */
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
    `Unknown env "${String(raw)}". Expected one of: ${ENVIRONMENT_NAMES.join(', ')}. Pass -c env=staging|prod.`,
  );
}

export function getEnvironment(
  name: EnvironmentName = ACTIVE_ENVIRONMENT,
  env: NodeJS.ProcessEnv = process.env,
  alertsEmailContext?: unknown,
): EnvironmentConfig {
  return {
    name,
    account: resolveAccountId(env),
    region: env.CDK_DEFAULT_REGION ?? 'us-east-1',
    domainName: DOMAIN_BY_ENV[name],
    statefulRemovalPolicy:
      name === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    alertsEmail: resolveAlertsEmail(alertsEmailContext, env),
  };
}
