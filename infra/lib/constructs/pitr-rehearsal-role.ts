import { Duration } from 'aws-cdk-lib';
import {
  Effect,
  PolicyStatement,
  Role,
  WebIdentityPrincipal,
  type IOpenIdConnectProvider,
} from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { appTableName } from '@gagnechris/data';
import type { EnvironmentConfig } from '../config/environments.js';

/** What `scripts/rehearse-pitr-restore.sh` reads from the live table. */
export const PITR_REHEARSAL_SOURCE_ATTRIBUTES = [
  'pk',
  'sk',
  'version',
  'updatedAt',
];

export interface PitrRehearsalRoleProps {
  readonly config: EnvironmentConfig;
  readonly provider: IOpenIdConnectProvider;
  readonly repoPath: string;
}

/**
 * `pitr-rehearsal.yml` role: restore the live table to
 * `<table>-restore-*`, read keys/version/updatedAt from the live table, and
 * read, tag and delete only the scratch table.
 */
export class PitrRehearsalRole extends Construct {
  readonly role: Role;

  constructor(scope: Construct, id: string, props: PitrRehearsalRoleProps) {
    super(scope, id);
    const { config, provider, repoPath } = props;
    const source = appTableName(config.name);
    const tableArn = (name: string) =>
      `arn:aws:dynamodb:${config.region}:${config.account}:table/${name}`;
    const sourceArn = tableArn(source);
    const scratchArn = tableArn(`${source}-restore-*`);

    this.role = new Role(this, 'Role', {
      roleName: `gagnechris-${config.name}-gha-pitr-rehearsal`,
      description: `Manual PITR restore rehearsal from GitHub Actions (${repoPath} prod).`,
      maxSessionDuration: Duration.hours(2),
      assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${repoPath}:environment:prod`,
        },
      }),
    });

    this.role.addToPolicy(
      new PolicyStatement({
        sid: 'RestoreLiveTable',
        effect: Effect.ALLOW,
        actions: [
          'dynamodb:DescribeContinuousBackups',
          'dynamodb:RestoreTableToPointInTime',
        ],
        resources: [sourceArn],
      }),
    );
    // Select is always in the request context for reads (ALL_ATTRIBUTES when
    // unset), so a scan without the projection is denied.
    this.role.addToPolicy(
      new PolicyStatement({
        sid: 'ScanLiveTableKeysAndVersions',
        effect: Effect.ALLOW,
        actions: ['dynamodb:Scan'],
        resources: [sourceArn],
        conditions: {
          StringEquals: { 'dynamodb:Select': 'SPECIFIC_ATTRIBUTES' },
          'ForAllValues:StringEquals': {
            'dynamodb:Attributes': PITR_REHEARSAL_SOURCE_ATTRIBUTES,
          },
        },
      }),
    );
    // A PITR restore needs item read/write on the target table.
    this.role.addToPolicy(
      new PolicyStatement({
        sid: 'ScratchTable',
        effect: Effect.ALLOW,
        actions: [
          'dynamodb:RestoreTableToPointInTime',
          'dynamodb:DescribeTable',
          'dynamodb:TagResource',
          'dynamodb:DeleteTable',
          'dynamodb:GetItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:BatchWriteItem',
        ],
        resources: [scratchArn],
      }),
    );

    NagSuppressions.addResourceSuppressions(
      this.role,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Scratch restore tables are named per run (<table>-restore-<stamp>); the wildcard covers only that prefix. The live table is scoped by exact ARN.',
          appliesTo: [`Resource::${scratchArn}`],
        },
      ],
      true,
    );
  }
}
