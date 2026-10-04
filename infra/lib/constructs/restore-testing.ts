import { ArnFormat, Duration, Stack } from 'aws-cdk-lib';
import {
  CfnRestoreTestingPlan,
  CfnRestoreTestingSelection,
  type IBackupVault,
} from 'aws-cdk-lib/aws-backup';
import { Metric, type Alarm } from 'aws-cdk-lib/aws-cloudwatch';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Rule, RuleTargetInput, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import {
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { LogGroup, ResourcePolicy, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { join } from 'node:path';
import {
  POWERTOOLS_METRICS_NAMESPACE,
  RESTORE_TEST_METRICS,
  RESTORE_TEST_SERVICE_NAME,
  RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES,
} from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';
import { emfServiceAlarm, heartbeatAlarm } from './emf-alarm.js';
import { NodeLambda, REPO_ROOT } from './node-lambda.js';

/** AWS Backup picks this name itself and deletes the table by it. */
export const RESTORE_TEST_TABLE_PATTERN = 'awsbackup-restore-test-*';
export const MANUAL_RESTORE_TABLE_PATTERN = 'gagnechris-*-restore-*';

export const RESTORE_TEST_VALIDATION_WINDOW_HOURS = 4;
export const LEFTOVER_MAX_AGE_HOURS = 24;

export interface AppTableRestoreTestingProps {
  readonly config: EnvironmentConfig;
  readonly table: ITable;
  readonly backupVault: IBackupVault;
  readonly alertsTopic: ITopic;
}

export class AppTableRestoreTesting extends Construct {
  readonly plan: CfnRestoreTestingPlan;
  readonly selection: CfnRestoreTestingSelection;
  readonly restoreRole: Role;
  readonly validator: NodeLambda;
  readonly validationFailedAlarm: Alarm;
  readonly leftoverTablesAlarm: Alarm;
  readonly staleRecoveryPointAlarm: Alarm;
  readonly validationMissingAlarm: Alarm;
  readonly advancedBackupDisabledAlarm: Alarm;
  readonly backupCheckNotRunningAlarm: Alarm;

  constructor(
    scope: Construct,
    id: string,
    props: AppTableRestoreTestingProps,
  ) {
    super(scope, id);
    const { config, table, backupVault, alertsTopic } = props;
    const stack = Stack.of(this);
    const prefix = `gagnechris-${config.name}`;

    this.restoreRole = new Role(this, 'RestoreRole', {
      roleName: `${prefix}-restore-testing`,
      description: 'AWS Backup restore testing of the app table',
      // IfExists: AWS Backup does not document setting aws:SourceAccount when
      // it assumes a restore role, and a missing key must not fail the test.
      assumedBy: new ServicePrincipal('backup.amazonaws.com', {
        conditions: {
          StringEqualsIfExists: { 'aws:SourceAccount': stack.account },
        },
      }),
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
            'AWS Backup restore testing requires the AWS-managed AWSBackupServiceRolePolicyForRestores permissions on its restore role; a hand-copied replica would drift from AWS updates.',
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
        'Validate AWS Backup restore-test tables and alarm on leftover restore scratch tables',
      entry: join(REPO_ROOT, 'services/restore-test/src/handler.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.minutes(2),
      powertoolsServiceName: RESTORE_TEST_SERVICE_NAME,
      alertsTopic,
      alarmNamePrefix: `${prefix}-restore-test`,
      iam5NagReason:
        'Reads only restore scratch tables by name pattern (awsbackup-restore-test-*, gagnechris-*-restore-*); ListTables, backup:PutRestoreValidationResult, DescribeRestoreJob, ListRestoreJobs and DescribeRegionSettings have no resource-level scoping; X-Ray uses the managed tracing wildcard.',
      iam5NagAppliesTo: [
        'Resource::*',
        {
          regex:
            '/^Resource::arn:<AWS::Partition>:dynamodb:.*:table/.*-restore-.*$/g',
        },
      ],
      bundling: {
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
      },
      environment: {
        LEFTOVER_MAX_AGE_HOURS: String(LEFTOVER_MAX_AGE_HOURS),
        SOURCE_TABLE_NAME: table.tableName,
        SOURCE_TABLE_ARN: table.tableArn,
        BACKUP_VAULT_NAME: backupVault.backupVaultName,
        RESTORE_TESTING_PLAN_NAME: planName,
        RESTORE_TESTING_PLAN_ARN: this.plan.attrRestoreTestingPlanArn,
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
    // COUNT returns no items, and the attribute allow-list keeps filters off
    // note text, so the validator can count the live table but never read it.
    this.validator.addToRolePolicy(
      new PolicyStatement({
        sid: 'CountSourceTable',
        actions: ['dynamodb:Scan'],
        resources: [table.tableArn],
        conditions: {
          StringEquals: { 'dynamodb:Select': 'COUNT' },
          'ForAllValues:StringEquals': {
            'dynamodb:Attributes': [...RESTORE_TEST_SOURCE_COUNT_ATTRIBUTES],
          },
        },
      }),
    );
    this.validator.addToRolePolicy(
      new PolicyStatement({
        sid: 'ReportRestoreValidation',
        actions: [
          'backup:PutRestoreValidationResult',
          'backup:DescribeRestoreJob',
          'backup:ListRestoreJobs',
          'backup:DescribeRegionSettings',
        ],
        resources: ['*'],
      }),
    );
    this.validator.addToRolePolicy(
      new PolicyStatement({
        sid: 'ReadBackupFreshness',
        actions: ['backup:ListRecoveryPointsByBackupVault'],
        resources: [backupVault.backupVaultArn],
      }),
    );
    this.validator.addToRolePolicy(
      new PolicyStatement({
        sid: 'ReadRestoreTestingPlan',
        actions: ['backup:GetRestoreTestingPlan'],
        resources: [this.plan.attrRestoreTestingPlanArn],
      }),
    );

    new Rule(this, 'ValidateRule', {
      ruleName: `${prefix}-restore-test-validate`,
      description:
        'DynamoDB restore job COMPLETED: validate it if the restore testing plan created it',
      // No plan filter: AWS does not document where restore-testing events
      // carry the plan ARN, so the validator checks it with DescribeRestoreJob.
      eventPattern: {
        source: ['aws.backup'],
        detailType: ['Restore Job State Change'],
        detail: {
          status: ['COMPLETED'],
          resourceType: ['DynamoDB'],
        },
      },
      targets: [new LambdaFunction(this.validator, { retryAttempts: 2 })],
    });

    // Records the real restore event shape for building pattern fixtures.
    // Events hold job ids and ARNs only, no table content.
    const restoreEventLog = new LogGroup(this, 'RestoreJobEventLog', {
      logGroupName: `/aws/events/${prefix}-restore-job-events`,
      retention: RetentionDays.ONE_WEEK,
    });
    new ResourcePolicy(this, 'RestoreJobEventLogPolicy', {
      resourcePolicyName: `${prefix}-restore-job-events`,
      policyStatements: [
        new PolicyStatement({
          principals: [new ServicePrincipal('events.amazonaws.com')],
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: [restoreEventLog.logGroupArn],
        }),
      ],
    });
    new Rule(this, 'RestoreJobEventLogRule', {
      ruleName: `${prefix}-restore-job-event-log`,
      description: 'Log every AWS Backup restore job state change',
      eventPattern: {
        source: ['aws.backup'],
        detailType: ['Restore Job State Change'],
      },
      targets: [
        {
          bind: () => ({
            arn: stack.formatArn({
              service: 'logs',
              resource: 'log-group',
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
              resourceName: restoreEventLog.logGroupName,
            }),
          }),
        },
      ],
    });

    new Rule(this, 'LeftoverCheckRule', {
      ruleName: `${prefix}-restore-leftover-check`,
      description:
        'Daily check: leftover restore scratch tables, recovery point age, last successful restore test, advanced backup setting',
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
          'AWS Backup restore test restored the app table but content validation FAILED (see restore-test logs)',
        serviceName: RESTORE_TEST_SERVICE_NAME,
        metricName: RESTORE_TEST_METRICS.validationFailed,
        alertsTopic,
      },
    );
    this.leftoverTablesAlarm = emfServiceAlarm(
      stack,
      'LeftoverRestoreTablesAlarm',
      {
        alarmName: `${prefix}-restore-leftover-tables`,
        alarmDescription:
          'A restore scratch table (awsbackup-restore-test-* or gagnechris-*-restore-*) is older than 24 h: a full copy of prod is lying around. Delete it (RUNBOOK)',
        serviceName: RESTORE_TEST_SERVICE_NAME,
        metricName: RESTORE_TEST_METRICS.leftoverTables,
        alertsTopic,
      },
    );

    // The daily check emits these every run, 0 or 1; like the leftover alarm
    // they re-alert daily until fixed.
    this.staleRecoveryPointAlarm = emfServiceAlarm(
      stack,
      'StaleRecoveryPointAlarm',
      {
        alarmName: `${prefix}-backup-recovery-point-stale`,
        alarmDescription:
          'Newest COMPLETED recovery point of the app table in the Backup vault is 26 h old or missing: daily backups have stopped (RUNBOOK Backups)',
        serviceName: RESTORE_TEST_SERVICE_NAME,
        metricName: RESTORE_TEST_METRICS.staleRecoveryPoint,
        alertsTopic,
      },
    );
    this.validationMissingAlarm = emfServiceAlarm(
      stack,
      'RestoreValidationMissingAlarm',
      {
        alarmName: `${prefix}-restore-validation-missing`,
        alarmDescription:
          'No restore test of the app table validated SUCCESSFUL in 8 days: the plan did not run, found no recovery point, or the validator never ran (RUNBOOK Weekly restore testing)',
        serviceName: RESTORE_TEST_SERVICE_NAME,
        metricName: RESTORE_TEST_METRICS.validationMissing,
        alertsTopic,
      },
    );
    this.advancedBackupDisabledAlarm = emfServiceAlarm(
      stack,
      'AdvancedBackupDisabledAlarm',
      {
        alarmName: `${prefix}-backup-advanced-dynamodb-off`,
        alarmDescription:
          'AWS Backup advanced features for DynamoDB are off in this Region: new backups are DynamoDB-managed, outside the vault key and vault lock (RUNBOOK Backups)',
        serviceName: RESTORE_TEST_SERVICE_NAME,
        metricName: RESTORE_TEST_METRICS.advancedBackupDisabled,
        alertsTopic,
      },
    );
    this.backupCheckNotRunningAlarm = heartbeatAlarm(
      stack,
      'BackupCheckNotRunningAlarm',
      {
        alarmName: `${prefix}-backup-check-not-running`,
        alarmDescription:
          'The daily restore-test backup check has not completed for 2 days, so the stale-backup and missing-restore-test alarms cannot fire (see restore-test logs)',
        metric: new Metric({
          namespace: POWERTOOLS_METRICS_NAMESPACE,
          metricName: RESTORE_TEST_METRICS.backupCheckCompleted,
          dimensionsMap: { service: RESTORE_TEST_SERVICE_NAME },
          statistic: 'Sum',
          period: Duration.days(1),
        }),
        alertsTopic,
        evaluationPeriods: 2,
        warmUpMinutes: 2 * 24 * 60,
      },
    );
  }
}
