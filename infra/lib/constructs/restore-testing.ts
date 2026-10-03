import { Duration, Stack } from 'aws-cdk-lib';
import {
  CfnRestoreTestingPlan,
  CfnRestoreTestingSelection,
  type IBackupVault,
} from 'aws-cdk-lib/aws-backup';
import type { Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, RuleTargetInput, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import {
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { join } from 'node:path';
import { RESTORE_TEST_SERVICE_NAME } from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';
import { emfServiceAlarm } from './emf-alarm.js';
import { NodeLambda, REPO_ROOT } from './node-lambda.js';

/**
 * AWS Backup names DynamoDB restore-test tables `awsbackup-restore-test-*`
 * (restore testing inferred metadata) and deletes them by that name.
 */
export const RESTORE_TEST_TABLE_PATTERN = 'awsbackup-restore-test-*';
/** Manual PITR / vault restores (`gagnechris-prod-restore-*`, `…-backup-restore-*`). */
export const MANUAL_RESTORE_TABLE_PATTERN = 'gagnechris-*-restore-*';

/** Hours AWS Backup keeps the restored table for validation before deleting it. */
export const RESTORE_TEST_VALIDATION_WINDOW_HOURS = 4;
/** A restore scratch table older than this is reported as a leftover. */
export const LEFTOVER_MAX_AGE_HOURS = 24;

export interface AppTableRestoreTestingProps {
  readonly config: EnvironmentConfig;
  readonly table: ITable;
  readonly backupVault: IBackupVault;
  readonly alertsTopic: ITopic;
}

/**
 * Weekly AWS Backup restore test of the app table (CHR-198), replacing the
 * PITR rehearsal that ran on every deploy.
 *
 * - Restore testing plan: Sundays 09:00 UTC, latest snapshot from the app-table
 *   vault (daily backup runs 07:00 UTC). AWS Backup restores it as
 *   `awsbackup-restore-test-*` and deletes it after validation (or when the
 *   validation window closes), whatever the outcome.
 * - Validator Lambda on the restore job's COMPLETED event: scans the scratch
 *   table, checks content, reports SUCCESSFUL / FAILED.
 * - Same Lambda, daily: alarms on any restore scratch table older than 24 h.
 */
export class AppTableRestoreTesting extends Construct {
  readonly plan: CfnRestoreTestingPlan;
  readonly selection: CfnRestoreTestingSelection;
  readonly restoreRole: Role;
  readonly validator: NodeLambda;
  readonly validationFailedAlarm: Alarm;
  readonly leftoverTablesAlarm: Alarm;

  constructor(
    scope: Construct,
    id: string,
    props: AppTableRestoreTestingProps,
  ) {
    super(scope, id);
    const { config, table, backupVault, alertsTopic } = props;
    const stack = Stack.of(this);
    const prefix = `gagnechris-${config.name}`;

    // Restore testing requires the AWSBackupServiceRolePolicyForRestores
    // permissions on the role it restores with.
    this.restoreRole = new Role(this, 'RestoreRole', {
      roleName: `${prefix}-restore-testing`,
      description: 'AWS Backup restore testing of the app table (CHR-198)',
      assumedBy: new ServicePrincipal('backup.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSBackupServiceRolePolicyForRestores',
        ),
      ],
    });
    NagSuppressions.addResourceSuppressions(
      this.restoreRole,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWS Backup restore testing requires the AWS-managed AWSBackupServiceRolePolicyForRestores permissions on its restore role; a hand-copied replica would drift from AWS updates (CHR-198).',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores',
          ],
        },
      ],
      true,
    );

    // Names: alphanumerics and underscores only (no hyphens).
    const planName = `gagnechris_${config.name}_app_table_weekly`;
    this.plan = new CfnRestoreTestingPlan(this, 'Plan', {
      restoreTestingPlanName: planName,
      scheduleExpression: 'cron(0 9 ? * SUN *)',
      scheduleExpressionTimezone: 'Etc/UTC',
      startWindowHours: 1,
      recoveryPointSelection: {
        algorithm: 'LATEST_WITHIN_WINDOW',
        includeVaults: [backupVault.backupVaultArn],
        recoveryPointTypes: ['SNAPSHOT'],
        // Daily backups + 1 h start window: 2 days always holds one.
        selectionWindowDays: 2,
      },
    });

    this.selection = new CfnRestoreTestingSelection(this, 'Selection', {
      restoreTestingPlanName: planName,
      restoreTestingSelectionName: 'app_table',
      protectedResourceType: 'DynamoDB',
      protectedResourceArns: [table.tableArn],
      iamRoleArn: this.restoreRole.roleArn,
      validationWindowHours: RESTORE_TEST_VALIDATION_WINDOW_HOURS,
    });
    this.selection.addResourceDependency(this.plan);

    const tableArn = (pattern: string) =>
      `arn:${stack.partition}:dynamodb:${stack.region}:${stack.account}:table/${pattern}`;

    this.validator = new NodeLambda(stack, 'RestoreTestFunction', {
      functionName: `${prefix}-restore-test`,
      description:
        'Validate AWS Backup restore-test tables and alarm on leftover restore scratch tables (CHR-198)',
      entry: join(REPO_ROOT, 'services/restore-test/src/handler.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.minutes(2),
      powertoolsServiceName: RESTORE_TEST_SERVICE_NAME,
      alertsTopic,
      alarmNamePrefix: `${prefix}-restore-test`,
      iam5NagReason:
        'Reads only restore scratch tables by name pattern (awsbackup-restore-test-*, gagnechris-*-restore-*); ListTables and backup:PutRestoreValidationResult have no resource-level scoping; X-Ray uses the managed tracing wildcard.',
      iam5NagAppliesTo: [
        'Resource::*',
        {
          regex:
            '/^Resource::arn:<AWS::Partition>:dynamodb:.*:table/.*-restore-.*$/g',
        },
      ],
      bundling: {
        // Bundle client-backup (PutRestoreValidationResult); the runtime SDK
        // provides DynamoDB.
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
      },
      environment: {
        LEFTOVER_MAX_AGE_HOURS: String(LEFTOVER_MAX_AGE_HOURS),
      },
    });

    this.validator.addToRolePolicy(
      new PolicyStatement({
        sid: 'ReadRestoreTestTables',
        actions: ['dynamodb:Scan', 'dynamodb:DescribeTable'],
        resources: [tableArn(RESTORE_TEST_TABLE_PATTERN)],
      }),
    );
    this.validator.addToRolePolicy(
      new PolicyStatement({
        sid: 'DescribeManualRestoreTables',
        actions: ['dynamodb:DescribeTable'],
        resources: [tableArn(MANUAL_RESTORE_TABLE_PATTERN)],
      }),
    );
    this.validator.addToRolePolicy(
      new PolicyStatement({
        sid: 'ListTables',
        actions: ['dynamodb:ListTables'],
        resources: ['*'],
      }),
    );
    this.validator.addToRolePolicy(
      new PolicyStatement({
        sid: 'ReportRestoreValidation',
        actions: ['backup:PutRestoreValidationResult'],
        resources: ['*'],
      }),
    );

    new Rule(this, 'ValidateRule', {
      ruleName: `${prefix}-restore-test-validate`,
      description: 'Restore testing job COMPLETED: validate the restored table',
      eventPattern: {
        source: ['aws.backup'],
        detailType: ['Restore Job State Change'],
        detail: {
          status: ['COMPLETED'],
          resourceType: ['DynamoDB'],
          restoreTestingPlanArn: [this.plan.attrRestoreTestingPlanArn],
        },
      },
      targets: [new LambdaFunction(this.validator, { retryAttempts: 2 })],
    });

    new Rule(this, 'LeftoverCheckRule', {
      ruleName: `${prefix}-restore-leftover-check`,
      description: 'Daily check for restore scratch tables older than 24 h',
      schedule: Schedule.cron({ minute: '0', hour: '12' }),
      targets: [
        new LambdaFunction(this.validator, {
          event: RuleTargetInput.fromObject({ action: 'leftoverCheck' }),
          retryAttempts: 2,
        }),
      ],
    });

    this.validationFailedAlarm = emfServiceAlarm(
      stack,
      'RestoreValidationFailedAlarm',
      {
        alarmName: `${prefix}-restore-validation-failed`,
        alarmDescription:
          'AWS Backup restore test restored the app table but content validation FAILED (see restore-test logs; CHR-198)',
        serviceName: RESTORE_TEST_SERVICE_NAME,
        metricName: 'RestoreValidationFailed',
        alertsTopic,
      },
    );
    this.leftoverTablesAlarm = emfServiceAlarm(
      stack,
      'LeftoverRestoreTablesAlarm',
      {
        alarmName: `${prefix}-restore-leftover-tables`,
        alarmDescription:
          'A restore scratch table (awsbackup-restore-test-* or gagnechris-*-restore-*) is older than 24 h: a full copy of prod is lying around. Delete it (RUNBOOK; CHR-198)',
        serviceName: RESTORE_TEST_SERVICE_NAME,
        metricName: 'LeftoverRestoreTables',
        alertsTopic,
      },
    );
  }
}
