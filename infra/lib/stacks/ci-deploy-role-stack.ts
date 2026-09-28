import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import {
  Effect,
  ManagedPolicy,
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
  type IRole,
} from 'aws-cdk-lib/aws-iam';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import { GITHUB_OWNER, GITHUB_REPO } from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';

export interface CiDeployRoleStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /** Guardrails alerts topic — drift role may publish failure notices. */
  readonly alertsTopic: ITopic;
  /** GitHub org/owner (default gagnechris). */
  readonly githubOwner?: string;
  /** GitHub repository name (default gagnechris). */
  readonly githubRepo?: string;
}

/**
 * GitHub Actions OIDC provider plus deploy (main), diff (PR), and drift roles.
 * No long-lived AWS keys in GitHub — short-lived tokens only.
 */
export class CiDeployRoleStack extends Stack {
  readonly deployRole: Role;
  readonly diffRole: Role;
  readonly driftRole: Role;

  constructor(scope: Construct, id: string, props: CiDeployRoleStackProps) {
    super(scope, id, props);

    const owner = props.githubOwner ?? GITHUB_OWNER;
    const repo = props.githubRepo ?? GITHUB_REPO;
    const repoPath = `${owner}/${repo}`;

    const provider = new OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const audienceCondition = {
      'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    };

    // Deploy: pushes to main, or jobs that use the `prod` GitHub Environment.
    this.deployRole = new Role(this, 'DeployRole', {
      roleName: `gagnechris-${props.config.name}-gha-deploy`,
      description: `CDK deploy from GitHub Actions (${repoPath} main/prod).`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: audienceCondition,
        StringLike: {
          'token.actions.githubusercontent.com:sub': [
            `repo:${repoPath}:ref:refs/heads/main`,
            `repo:${repoPath}:environment:prod`,
          ],
        },
      }),
    });
    this.deployRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
    );

    // Diff: pull_request workflows only (read-only).
    this.diffRole = new Role(this, 'DiffRole', {
      roleName: `gagnechris-${props.config.name}-gha-diff`,
      description: `CDK diff from GitHub Actions PRs (${repoPath}).`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: audienceCondition,
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${repoPath}:pull_request`,
        },
      }),
    });
    this.diffRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
    );
    // cdk diff needs the bootstrap lookup role only — never deploy/cfn-exec
    // (those trust the whole account; AssumeRole * would escalate to admin).
    this.diffRole.addToPolicy(
      new PolicyStatement({
        sid: 'CdkLookupAssumeRole',
        effect: Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${props.config.account}:role/cdk-*-lookup-role-*`,
        ],
      }),
    );

    // Drift: nightly / manual via `prod` environment — CFN drift + read, not deploy.
    this.driftRole = new Role(this, 'DriftRole', {
      roleName: `gagnechris-${props.config.name}-gha-drift`,
      description: `CDK drift from GitHub Actions (${repoPath} prod).`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: audienceCondition,
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${repoPath}:environment:prod`,
        },
      }),
    });
    this.driftRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
    );
    this.driftRole.addToPolicy(
      new PolicyStatement({
        sid: 'CloudFormationDetectDrift',
        effect: Effect.ALLOW,
        actions: [
          'cloudformation:DetectStackDrift',
          'cloudformation:DetectStackResourceDrift',
          'cloudformation:DescribeStackDriftDetectionStatus',
          'cloudformation:DescribeStackResourceDrifts',
        ],
        resources: ['*'],
      }),
    );
    this.driftRole.addToPolicy(
      new PolicyStatement({
        sid: 'CdkLookupAssumeRole',
        effect: Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [
          `arn:aws:iam::${props.config.account}:role/cdk-*-lookup-role-*`,
        ],
      }),
    );
    props.alertsTopic.grantPublish(this.driftRole);

    this.suppressRoleNags(
      this.deployRole,
      this.diffRole,
      this.driftRole,
      props,
    );

    new CfnOutput(this, 'DeployRoleArn', {
      value: this.deployRole.roleArn,
      description:
        'Set GitHub Actions variable AWS_DEPLOY_ROLE_ARN to this value.',
    });

    new CfnOutput(this, 'DiffRoleArn', {
      value: this.diffRole.roleArn,
      description:
        'Set GitHub Actions variable AWS_DIFF_ROLE_ARN to this value.',
    });

    new CfnOutput(this, 'DriftRoleArn', {
      value: this.driftRole.roleArn,
      description:
        'Set GitHub Actions variable AWS_DRIFT_ROLE_ARN to this value.',
    });

    new CfnOutput(this, 'GitHubOidcProviderArn', {
      value: provider.openIdConnectProviderArn,
      description: 'IAM OIDC provider for token.actions.githubusercontent.com.',
    });
  }

  private suppressRoleNags(
    deployRole: IRole,
    diffRole: IRole,
    driftRole: IRole,
    props: CiDeployRoleStackProps,
  ): void {
    NagSuppressions.addResourceSuppressions(
      deployRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'Personal-account CI deploy role uses AdministratorAccess so CDK can manage all stacks and bootstrap roles; trust is locked to this repo main/prod via OIDC.',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/AdministratorAccess',
          ],
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      diffRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'PR diff role uses ReadOnlyAccess plus minimal STS/CFN/SSM reads for cdk diff.',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/ReadOnlyAccess',
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Diff role may assume CDK bootstrap lookup roles (cdk-*-lookup-role-* only); ReadOnlyAccess covers CFN/SSM reads for cdk diff.',
          appliesTo: [
            `Resource::arn:aws:iam::${props.config.account}:role/cdk-*-lookup-role-*`,
          ],
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      driftRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'Drift role uses ReadOnlyAccess plus explicit CloudFormation Detect*Drift APIs (not in ReadOnlyAccess) and SNS publish to the alerts topic only.',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/ReadOnlyAccess',
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Drift detection must target all stacks (*); lookup AssumeRole is scoped to cdk-*-lookup-role-* only.',
          appliesTo: [
            'Resource::*',
            `Resource::arn:aws:iam::${props.config.account}:role/cdk-*-lookup-role-*`,
          ],
        },
      ],
      true,
    );
  }
}
