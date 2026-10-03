import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { beforeAll, describe, expect, it } from 'vitest';
import { getEnvironment } from '../lib/config/environments.js';
import { REPO_ROOT } from '../lib/constructs/node-lambda.js';
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
};

let template: Template;

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
  template = Template.fromStack(data);
});

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

describe('AWS Backup restore testing (CHR-198)', () => {
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
        'backup:PutRestoreValidationResult',
        'dynamodb:DescribeTable',
        'dynamodb:DescribeTable',
        'dynamodb:ListTables',
        'dynamodb:Scan',
        'xray:PutTelemetryRecords',
        'xray:PutTraceSegments',
      ].sort(),
    );
    const json = JSON.stringify(statements);
    // Never the live table, never writes or deletes.
    expect(json).not.toMatch(/AppTable/);
    expect(json).not.toMatch(/dynamodb:(Put|Update|Delete|BatchWrite|\*)/);
    const scan = statements.find((s) => actionsOf(s).includes('dynamodb:Scan'));
    expect(JSON.stringify(scan?.Resource)).toContain(
      ':table/awsbackup-restore-test-*',
    );
    const wildcard = statements.filter((s) => s.Resource === '*');
    expect(wildcard.flatMap(actionsOf).sort()).toEqual([
      'backup:PutRestoreValidationResult',
      'dynamodb:ListTables',
      'xray:PutTelemetryRecords',
      'xray:PutTraceSegments',
    ]);
  });

  it('triggers the validator on COMPLETED restore jobs of this plan only', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'gagnechris-prod-restore-test-validate',
      EventPattern: {
        source: ['aws.backup'],
        'detail-type': ['Restore Job State Change'],
        detail: {
          status: ['COMPLETED'],
          resourceType: ['DynamoDB'],
          restoreTestingPlanArn: [
            {
              'Fn::GetAtt': [
                Match.stringLikeRegexp('RestoreTestingPlan'),
                'RestoreTestingPlanArn',
              ],
            },
          ],
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
});

describe('deploy workflow (CHR-198)', () => {
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
});
