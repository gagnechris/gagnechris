import { RemovalPolicy } from 'aws-cdk-lib';

export const ENVIRONMENT_NAMES = ['staging', 'prod'] as const;

export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export interface EnvironmentConfig {
  readonly name: EnvironmentName;
  /** AWS account ID — resolved from the environment, never committed. */
  readonly account: string;
  readonly region: string;
  /** Apex or site hostname for this environment. */
  readonly domainName: string;
  /** Removal policy for stateful resources (buckets, tables, user pools). */
  readonly statefulRemovalPolicy: RemovalPolicy;
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

export function parseEnvironmentName(raw: unknown): EnvironmentName {
  const value = typeof raw === 'string' ? raw : 'staging';
  if ((ENVIRONMENT_NAMES as readonly string[]).includes(value)) {
    return value as EnvironmentName;
  }
  throw new Error(
    `Unknown env "${String(raw)}". Expected one of: ${ENVIRONMENT_NAMES.join(', ')}. Pass -c env=staging|prod.`,
  );
}

export function getEnvironment(
  name: EnvironmentName,
  env: NodeJS.ProcessEnv = process.env,
): EnvironmentConfig {
  return {
    name,
    account: resolveAccountId(env),
    region: env.CDK_DEFAULT_REGION ?? 'us-east-1',
    domainName: DOMAIN_BY_ENV[name],
    statefulRemovalPolicy:
      name === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
  };
}
