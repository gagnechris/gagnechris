import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { beforeAll, describe, expect, it } from 'vitest';
import { RESTORE_TEST_METRICS } from '../lib/config/constants.js';
import { getEnvironment } from '../lib/config/environments.js';
import { REPO_ROOT } from '../lib/constructs/node-lambda.js';
import { CiDeployRoleStack } from '../lib/stacks/ci-deploy-role-stack.js';
import { DataStack } from '../lib/stacks/data-stack.js';

const testEnv = {
  CDK_ACCOUNT: '123456789012',
  ALERTS_EMAIL: 'alerts@example.com',
};

type Statement = {
  Sid?: string;
  Action: string | string[];
  Resource: unknown;
  Effect: string;
  Condition?: Record<string, Record<string, unknown>>;
};

let template: Template;
let ciTemplate: Template;

beforeAll(() => {
  const app = new App();
  const config = getEnvironment('prod', testEnv);
  const deps = new Stack(app, 'RestoreTestDeps', {
    env: { account: config.account, region: config.region },
  });
  const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
  const data = new DataStack(app, 'Data-prod', {
    env: { account: config.account, region: config.region },
    config,
    alertsTopic,
  });
  const ci = new CiDeployRoleStack(app, 'CiDeployRole-prod', {
    env: { account: config.account, region: config.region },
    config,
    alertsTopic,
  });
  template = Template.fromStack(data);
  ciTemplate = Template.fromStack(ci);
});

type AlarmProps = {
  AlarmName: string;
  MetricName: string;
  Threshold: number;
  ComparisonOperator: string;
  TreatMissingData: string;
  Period: number;
  EvaluationPeriods: number;
  DatapointsToAlarm?: number;
  WarmUpConfiguration?: { WarmUpPeriodDurationInMinutes: number };
};

function alarm(name: string): AlarmProps {
  const found = Object.values(
    template.findResources('AWS::CloudWatch::Alarm', {
      Properties: { AlarmName: name },
    }),
  ) as { Properties: AlarmProps }[];
  expect(found, name).toHaveLength(1);
  return found[0]!.Properties;
}

/** One datapoint vs the alarm's threshold; undefined = no datapoint. */
function breaches(a: AlarmProps, value: number | undefined): boolean {
  if (value === undefined) return a.TreatMissingData === 'breaching';
  switch (a.ComparisonOperator) {
    case 'GreaterThanOrEqualToThreshold':
      return value >= a.Threshold;
    case 'LessThanThreshold':
      return value < a.Threshold;
    default:
      throw new Error(`unexpected ${a.ComparisonOperator}`);
  }
}

function validatorStatements(): Statement[] {
  const policies = template.findResources('AWS::IAM::Policy', {
    Properties: {
      Roles: [
        { Ref: Match.stringLikeRegexp('^RestoreTestFunctionServiceRole') },
      ],
    },
  });
  const docs = Object.values(policies);
  expect(docs).toHaveLength(1);
  return (
    docs[0] as { Properties: { PolicyDocument: { Statement: Statement[] } } }
  ).Properties.PolicyDocument.Statement;
}

const actionsOf = (s: Statement) =>
  Array.isArray(s.Action) ? s.Action : [s.Action];

describe('AWS Backup restore testing', () => {
  it('runs a weekly restore test of the latest snapshot from the app-table vault', () => {
    template.hasResourceProperties('AWS::Backup::RestoreTestingPlan', {
      RestoreTestingPlanName: 'gagnechris_prod_app_table_weekly',
      ScheduleExpression: 'cron(0 9 ? * SUN *)',
      RecoveryPointSelection: {
        Algorithm: 'LATEST_WITHIN_WINDOW',
        IncludeVaults: [
          {
            'Fn::GetAtt': [
              Match.stringLikeRegexp('AppTableBackupVault'),
              'BackupVaultArn',
            ],
          },
        ],
        RecoveryPointTypes: ['SNAPSHOT'],
        SelectionWindowDays: 2,
      },
    });
  });

  it('selects only the app table, with a short validation window', () => {
    template.resourceCountIs('AWS::Backup::RestoreTestingSelection', 1);
    template.hasResourceProperties('AWS::Backup::RestoreTestingSelection', {
      RestoreTestingPlanName: 'gagnechris_prod_app_table_weekly',
      ProtectedResourceType: 'DynamoDB',
      ProtectedResourceArns: [
        { 'Fn::GetAtt': [Match.stringLikeRegexp('^AppTable'), 'Arn'] },
      ],
      ValidationWindowHours: 4,
      IamRoleArn: {
        'Fn::GetAtt': [
          Match.stringLikeRegexp('RestoreTestingRestoreRole'),
          'Arn',
        ],
      },
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'gagnechris-prod-restore-testing',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Principal: { Service: 'backup.amazonaws.com' },
          }),
        ],
      }),
    });
  });

  it('validator IAM is read-only on restore scratch tables', () => {
    const statements = validatorStatements();
    const all = statements.flatMap(actionsOf);
    expect(all.sort()).toEqual(
      [
        'backup:DescribeRegionSettings',
        'backup:DescribeRestoreJob',
        'backup:GetRestoreTestingPlan',
        'backup:ListRecoveryPointsByBackupVault',
        'backup:ListRestoreJobs',
        'backup:PutRestoreValidationResult',
        'dynamodb:DescribeTable',
        'dynamodb:DescribeTable',
        'dynamodb:ListTables',
        'dynamodb:Scan',
        'dynamodb:Scan',
        'xray:PutTelemetryRecords',
        'xray:PutTraceSegments',
      ].sort(),
    );
    const json = JSON.stringify(statements);
    expect(json).not.toMatch(/dynamodb:(Get|Query|Put|Update|Delete|Batch|\*)/);
    const scans = statements.filter((s) =>
      actionsOf(s).includes('dynamodb:Scan'),
    );
    const scratch = scans.find((s) =>
      JSON.stringify(s.Resource).includes(':table/awsbackup-restore-test-*'),
    );
    expect(actionsOf(scratch!).sort()).toEqual([
      'dynamodb:DescribeTable',
      'dynamodb:Scan',
    ]);
    // The only grant on the live table: COUNT scans over metadata attributes.
    const live = statements.filter((s) =>
      /"AppTable[0-9A-F]+","Arn"/.test(JSON.stringify(s.Resource)),
    );
    expect(live).toHaveLength(1);
    expect(actionsOf(live[0]!)).toEqual(['dynamodb:Scan']);
    expect(live[0]!.Condition).toEqual({
      StringEquals: { 'dynamodb:Select': 'COUNT' },
      'ForAllValues:StringEquals': {
        'dynamodb:Attributes': [
          'pk',
          'sk',
          'entityType',
          'createdAt',
          'updatedAt',
        ],
      },
    });
    const wildcard = statements.filter((s) => s.Resource === '*');
    expect(wildcard.flatMap(actionsOf).sort()).toEqual([
      'backup:DescribeRegionSettings',
      'backup:DescribeRestoreJob',
      'backup:ListRestoreJobs',
      'backup:PutRestoreValidationResult',
      'dynamodb:ListTables',
      'xray:PutTelemetryRecords',
      'xray:PutTraceSegments',
    ]);
  });

  it('passes the validator the live table, vault and plan it checks', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gagnechris-prod-restore-test',
      Environment: {
        Variables: Match.objectLike({
          SOURCE_TABLE_NAME: { Ref: Match.stringLikeRegexp('^AppTable') },
          SOURCE_TABLE_ARN: {
            'Fn::GetAtt': [Match.stringLikeRegexp('^AppTable'), 'Arn'],
          },
          BACKUP_VAULT_NAME: {
            'Fn::GetAtt': [
              Match.stringLikeRegexp('AppTableBackupVault'),
              'BackupVaultName',
            ],
          },
          RESTORE_TESTING_PLAN_NAME: 'gagnechris_prod_app_table_weekly',
          RESTORE_TESTING_PLAN_ARN: {
            'Fn::GetAtt': [
              Match.stringLikeRegexp('RestoreTestingPlan'),
              'RestoreTestingPlanArn',
            ],
          },
        }),
      },
    });
  });

  it('restore-testing role trusts AWS Backup from this account only', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'gagnechris-prod-restore-testing',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Principal: { Service: 'backup.amazonaws.com' },
            Condition: {
              StringEqualsIfExists: { 'aws:SourceAccount': '123456789012' },
            },
          }),
        ],
      },
    });
  });

  it('triggers the validator on COMPLETED DynamoDB restore jobs without a plan filter', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'gagnechris-prod-restore-test-validate',
      EventPattern: {
        source: ['aws.backup'],
        'detail-type': ['Restore Job State Change'],
        detail: {
          status: ['COMPLETED'],
          resourceType: ['DynamoDB'],
        },
      },
      Targets: [
        Match.objectLike({
          Arn: {
            'Fn::GetAtt': [
              Match.stringLikeRegexp('^RestoreTestFunction'),
              'Arn',
            ],
          },
        }),
      ],
    });
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'gagnechris-prod-restore-leftover-check',
      ScheduleExpression: 'cron(0 12 * * ? *)',
      Targets: [Match.objectLike({ Input: '{"action":"leftoverCheck"}' })],
    });
  });

  it('logs every restore job event to a 7-day log group EventBridge can write', () => {
    const logGroupId = Object.keys(
      template.findResources('AWS::Logs::LogGroup', {
        Properties: {
          LogGroupName: '/aws/events/gagnechris-prod-restore-job-events',
          RetentionInDays: 7,
        },
      }),
    )[0];
    expect(logGroupId).toBeDefined();
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'gagnechris-prod-restore-job-event-log',
      EventPattern: {
        source: ['aws.backup'],
        'detail-type': ['Restore Job State Change'],
      },
      Targets: [
        Match.objectLike({
          Arn: {
            'Fn::Join': [
              '',
              Match.arrayWith([
                Match.stringLikeRegexp(':log-group:$'),
                { Ref: logGroupId },
              ]),
            ],
          },
        }),
      ],
    });
    template.hasResourceProperties('AWS::Logs::ResourcePolicy', {
      PolicyName: 'gagnechris-prod-restore-job-events',
      PolicyDocument: {
        'Fn::Join': [
          '',
          Match.arrayWith([
            Match.stringLikeRegexp(
              'logs:CreateLogStream.*logs:PutLogEvents.*events\\.amazonaws\\.com',
            ),
            { 'Fn::GetAtt': [logGroupId, 'Arn'] },
          ]),
        ],
      },
    });
  });

  it('alarms on failed validation and leftover scratch tables', () => {
    for (const [name, metric] of [
      ['gagnechris-prod-restore-validation-failed', 'RestoreValidationFailed'],
      ['gagnechris-prod-restore-leftover-tables', 'LeftoverRestoreTables'],
    ]) {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: name,
        MetricName: metric,
        Namespace: 'gagnechris',
        Dimensions: [{ Name: 'service', Value: 'gagnechris-restore-test' }],
        Threshold: 1,
        AlarmActions: [Match.anyValue()],
      });
    }
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-restore-test-lambda-errors',
    });
  });

  it('alarms when backups or restore tests silently stop', () => {
    for (const [name, metric] of [
      [
        'gagnechris-prod-backup-recovery-point-stale',
        RESTORE_TEST_METRICS.staleRecoveryPoint,
      ],
      [
        'gagnechris-prod-restore-validation-missing',
        RESTORE_TEST_METRICS.validationMissing,
      ],
      [
        'gagnechris-prod-backup-advanced-dynamodb-off',
        RESTORE_TEST_METRICS.advancedBackupDisabled,
      ],
    ] as const) {
      const a = alarm(name);
      expect(a).toMatchObject({
        MetricName: metric,
        AlarmActions: [expect.anything()],
      });
      // The daily check emits 1 for the forced condition (stale point,
      // deleted or never-run plan, setting off) and 0 when healthy.
      expect(breaches(a, 1), name).toBe(true);
      expect(breaches(a, 0), name).toBe(false);
    }
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-restore-validation-missing',
      Namespace: 'gagnechris',
      Dimensions: [{ Name: 'service', Value: 'gagnechris-restore-test' }],
      AlarmActions: [Match.anyValue()],
    });
  });

  it('alarms when the daily backup check itself stops reporting', () => {
    const a = alarm('gagnechris-prod-backup-check-not-running');
    expect(a).toMatchObject({
      MetricName: RESTORE_TEST_METRICS.backupCheckCompleted,
      Period: 86_400,
      EvaluationPeriods: 2,
      DatapointsToAlarm: 2,
      TreatMissingData: 'breaching',
      WarmUpConfiguration: { WarmUpPeriodDurationInMinutes: 2_880 },
    });
    expect(breaches(a, undefined)).toBe(true);
    expect(breaches(a, 0)).toBe(true);
    expect(breaches(a, 1)).toBe(false);
  });
});

describe('PITR rehearsal role', () => {
  function rehearsalStatements(): Statement[] {
    const policies = Object.values(
      ciTemplate.findResources('AWS::IAM::Policy', {
        Properties: {
          Roles: [{ Ref: Match.stringLikeRegexp('^PitrRehearsalRole') }],
        },
      }),
    ) as { Properties: { PolicyDocument: { Statement: Statement[] } } }[];
    expect(policies).toHaveLength(1);
    return policies[0]!.Properties.PolicyDocument.Statement;
  }
  const LIVE = 'arn:aws:dynamodb:us-east-1:123456789012:table/gagnechris-prod';
  const SCRATCH = `${LIVE}-restore-*`;

  it('is assumable only from the prod environment and has no managed policy', () => {
    ciTemplate.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'gagnechris-prod-gha-pitr-rehearsal',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub':
                  'repo:gagnechris/gagnechris:environment:prod',
              },
            },
          }),
        ],
      },
      ManagedPolicyArns: Match.absent(),
    });
  });

  it('can restore and read only keys and versions of the live table', () => {
    const live = rehearsalStatements().filter((s) => s.Resource === LIVE);
    expect(live.flatMap(actionsOf).sort()).toEqual([
      'dynamodb:DescribeContinuousBackups',
      'dynamodb:RestoreTableToPointInTime',
      'dynamodb:Scan',
    ]);
    const scan = live.find((s) => actionsOf(s).includes('dynamodb:Scan'));
    expect(scan?.Condition).toEqual({
      StringEquals: { 'dynamodb:Select': 'SPECIFIC_ATTRIBUTES' },
      'ForAllValues:StringEquals': {
        'dynamodb:Attributes': ['pk', 'sk', 'version', 'updatedAt'],
      },
    });
  });

  it('writes and deletes only gagnechris-prod-restore-* scratch tables', () => {
    const statements = rehearsalStatements();
    for (const s of statements) {
      expect([LIVE, SCRATCH]).toContain(s.Resource);
      if (s.Resource === LIVE) {
        expect(actionsOf(s).join()).not.toMatch(/Put|Update|Delete|Batch/);
      }
    }
    const scratch = statements.find((s) => s.Resource === SCRATCH);
    expect(actionsOf(scratch!)).toContain('dynamodb:DeleteTable');
    expect(JSON.stringify(statements)).not.toMatch(/"\*"|dynamodb:\*/);
  });

  it('matches the projection the rehearsal script scans with', () => {
    const script = readFileSync(
      join(REPO_ROOT, 'scripts/rehearse-pitr-restore.sh'),
      'utf8',
    );
    expect(script).toContain('--select SPECIFIC_ATTRIBUTES');
    expect(script).toContain(`--projection-expression 'pk, sk, #v, updatedAt'`);
    expect(script).toContain(`'{"#v":"version"}'`);
  });
});

describe('advanced DynamoDB backup setting', () => {
  it('is documented in the RUNBOOK with the alarm that watches it', () => {
    const runbook = readFileSync(join(REPO_ROOT, 'infra/RUNBOOK.md'), 'utf8');
    expect(runbook).toContain('ResourceTypeManagementPreference.DynamoDB');
    expect(runbook).toContain('gagnechris-prod-backup-advanced-dynamodb-off');
  });

  it('names the vault key as the AWS-managed aws/backup key', () => {
    const vault = Object.values(
      template.findResources('AWS::Backup::BackupVault'),
    )[0] as {
      Metadata: { cdk_nag: { rules_to_suppress: { reason: string }[] } };
    };
    const reasons = vault.Metadata.cdk_nag.rules_to_suppress.map(
      (r) => r.reason,
    );
    expect(reasons.join()).toContain('AWS-managed aws/backup KMS key');
    expect(reasons.join()).not.toMatch(/AWS-owned/);
  });
});

describe('deploy workflow', () => {
  const workflow = (name: string) =>
    readFileSync(join(REPO_ROOT, '.github/workflows', name), 'utf8');

  it('never runs a restore rehearsal on deploy', () => {
    const cdk = workflow('cdk.yml');
    expect(cdk).not.toContain('rehearse-pitr-restore');
    expect(cdk).not.toMatch(/restore-table-to-point-in-time|start-restore-job/);
  });

  it('serialises manual PITR rehearsals', () => {
    expect(workflow('pitr-rehearsal.yml')).toMatch(/\nconcurrency:/);
  });

  it('runs the PITR rehearsal on its scoped role, never the deploy role', () => {
    const pitr = workflow('pitr-rehearsal.yml');
    expect(pitr).not.toContain('AWS_DEPLOY_ROLE_ARN');
    expect(pitr).toMatch(
      /role-to-assume: \$\{\{ vars\.AWS_PITR_REHEARSAL_ROLE_ARN \}\}/,
    );
  });
});
