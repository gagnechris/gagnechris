import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import {
  BackupPlan,
  BackupPlanRule,
  BackupResource,
  BackupVault,
} from 'aws-cdk-lib/aws-backup';
import {
  AttributeType,
  BillingMode,
  Operation,
  ProjectionType,
  StreamViewType,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { SnsTopic } from 'aws-cdk-lib/aws-events-targets';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import {
  APP_TABLE,
  LAST_DEPLOYED_GSIS,
  appTableName,
  assertSafeGsiUpdate,
  gsiProjection,
  type AppTableDefinition,
  type DynamoAttributeTypeCode,
  type DynamoProjectionType,
} from '@gagnechris/data';
import { ssmParameterName } from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';
import { metricAlarm } from '../constructs/emf-alarm.js';
import { AppTableRestoreTesting } from '../constructs/restore-testing.js';

function toCdkAttrType(code: DynamoAttributeTypeCode): AttributeType {
  switch (code) {
    case 'S':
      return AttributeType.STRING;
    case 'N':
      return AttributeType.NUMBER;
    case 'B':
      return AttributeType.BINARY;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

function toCdkProjectionType(type: DynamoProjectionType): ProjectionType {
  switch (type) {
    case 'ALL':
      return ProjectionType.ALL;
    case 'KEYS_ONLY':
      return ProjectionType.KEYS_ONLY;
    case 'INCLUDE':
      return ProjectionType.INCLUDE;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function toCdkBillingMode(
  mode: (typeof APP_TABLE)['billingMode'],
): BillingMode {
  switch (mode) {
    case 'PAY_PER_REQUEST':
      return BillingMode.PAY_PER_REQUEST;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function toCdkStreamViewType(
  view: (typeof APP_TABLE)['streamViewType'],
): StreamViewType {
  switch (view) {
    case 'NEW_AND_OLD_IMAGES':
      return StreamViewType.NEW_AND_OLD_IMAGES;
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}

const APP_TABLE_OPERATIONS = [
  Operation.GET_ITEM,
  Operation.PUT_ITEM,
  Operation.UPDATE_ITEM,
  Operation.DELETE_ITEM,
  Operation.QUERY,
  Operation.SCAN,
  Operation.BATCH_GET_ITEM,
  Operation.BATCH_WRITE_ITEM,
  Operation.TRANSACT_WRITE_ITEMS,
  Operation.TRANSACT_GET_ITEMS,
];

export interface DataStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly alertsTopic: ITopic;
  /** Tests only; defaults to {@link APP_TABLE}. */
  readonly tableDefinition?: AppTableDefinition;
}

export const BACKUP_RETENTION_DAYS = 7;
const BACKUP_FAILURE_STATES = ['FAILED', 'ABORTED', 'EXPIRED', 'PARTIAL'];

export class DataStack extends Stack {
  readonly table: Table;
  readonly restoreTesting: AppTableRestoreTesting;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { config, alertsTopic } = props;
    const def = props.tableDefinition ?? APP_TABLE;

    // Offline guard only; `check:deployed-gsi` compares against the live table.
    assertSafeGsiUpdate(LAST_DEPLOYED_GSIS, def.globalSecondaryIndexes);

    this.table = new Table(this, 'AppTable', {
      tableName: appTableName(config.name),
      partitionKey: {
        name: def.partitionKey.name,
        type: toCdkAttrType(def.partitionKey.type),
      },
      sortKey: {
        name: def.sortKey.name,
        type: toCdkAttrType(def.sortKey.type),
      },
      billingMode: toCdkBillingMode(def.billingMode),
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      deletionProtection: true,
      removalPolicy: config.statefulRemovalPolicy,
      stream: toCdkStreamViewType(def.streamViewType),
      timeToLiveAttribute: def.timeToLiveAttribute,
    });

    for (const gsi of def.globalSecondaryIndexes) {
      // Shared with the local bootstrap so both create identical indexes.
      const projection = gsiProjection(gsi);
      this.table.addGlobalSecondaryIndex({
        indexName: gsi.indexName,
        partitionKey: {
          name: gsi.partitionKey.name,
          type: toCdkAttrType(gsi.partitionKey.type),
        },
        sortKey: {
          name: gsi.sortKey.name,
          type: toCdkAttrType(gsi.sortKey.type),
        },
        projectionType: toCdkProjectionType(projection.ProjectionType),
        ...(projection.NonKeyAttributes
          ? { nonKeyAttributes: projection.NonKeyAttributes }
          : {}),
      });
    }

    this.table.applyRemovalPolicy(RemovalPolicy.RETAIN);

    // Governance-mode lock (no `changeableFor`): an admin can still change or
    // remove it. Setting `changeableFor` makes it compliance mode, which
    // becomes permanent once that window ends.
    const backupVault = new BackupVault(this, 'AppTableBackupVault', {
      backupVaultName: `gagnechris-${config.name}-app-table`,
      removalPolicy: RemovalPolicy.RETAIN,
      lockConfiguration: {
        minRetention: Duration.days(BACKUP_RETENTION_DAYS),
        maxRetention: Duration.days(35),
      },
    });
    NagSuppressions.addResourceSuppressions(backupVault, [
      {
        id: 'AwsSolutions-BACKUP1',
        reason:
          'Vault uses the AWS-managed aws/backup KMS key (advanced DynamoDB backup is on, so recovery points are encrypted with it); a customer-managed key is a follow-up if Notebook data classification requires it.',
      },
    ]);

    const backupPlan = new BackupPlan(this, 'AppTableBackupPlan', {
      backupPlanName: `gagnechris-${config.name}-app-table-daily`,
      backupVault,
      backupPlanRules: [
        new BackupPlanRule({
          ruleName: 'Daily',
          scheduleExpression: Schedule.cron({
            minute: '0',
            hour: '7',
          }),
          deleteAfter: Duration.days(BACKUP_RETENTION_DAYS),
        }),
      ],
    });
    const backupSelection = backupPlan.addSelection('AppTableSelection', {
      resources: [BackupResource.fromDynamoDbTable(this.table)],
      allowRestores: true,
    });
    NagSuppressions.addResourceSuppressions(
      backupSelection,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AWS Backup selection uses the AWS-managed Backup/Restore service-role policies required by the Backup service; custom least-privilege replicas drift from AWS updates.',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup',
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores',
          ],
        },
      ],
      true,
    );

    this.restoreTesting = new AppTableRestoreTesting(this, 'RestoreTesting', {
      config,
      table: this.table,
      backupVault,
      alertsTopic,
    });

    // The event types name their fields differently: restore jobs report
    // `status` (not `state`) and carry no vault name, and copy jobs only name
    // source/destination vault ARNs. Hence one `$or` branch per shape.
    new Rule(this, 'BackupJobFailureRule', {
      ruleName: `gagnechris-${config.name}-backup-job-failures`,
      description: 'AWS Backup job failed, aborted, expired or partial',
      eventPattern: {
        source: ['aws.backup'],
        detailType: [
          'Backup Job State Change',
          'Restore Job State Change',
          'Copy Job State Change',
        ],
        detail: {
          $or: [
            {
              state: BACKUP_FAILURE_STATES,
              backupVaultArn: [backupVault.backupVaultArn],
            },
            {
              status: BACKUP_FAILURE_STATES,
              backupVaultArn: [backupVault.backupVaultArn],
            },
            {
              state: BACKUP_FAILURE_STATES,
              sourceBackupVaultArn: [backupVault.backupVaultArn],
            },
            {
              status: BACKUP_FAILURE_STATES,
              restoreTestingPlanArn: [
                this.restoreTesting.plan.attrRestoreTestingPlanArn,
              ],
            },
          ],
        },
      },
      targets: [new SnsTopic(alertsTopic)],
    });

    metricAlarm(this, 'AppTableSystemErrors', {
      alarmName: `gagnechris-${config.name}-dynamodb-system-errors`,
      alarmDescription: 'DynamoDB AppTable SystemErrors ≥ 1 in 5 minutes',
      metric: this.table.metricSystemErrorsForOperations({
        operations: APP_TABLE_OPERATIONS,
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      alertsTopic,
    });
    metricAlarm(this, 'AppTableThrottledRequests', {
      alarmName: `gagnechris-${config.name}-dynamodb-throttled-requests`,
      alarmDescription: 'DynamoDB AppTable ThrottledRequests ≥ 1 in 5 minutes',
      metric: this.table.metricThrottledRequestsForOperations({
        operations: APP_TABLE_OPERATIONS,
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      alertsTopic,
    });

    new StringParameter(this, 'TableNameParam', {
      parameterName: ssmParameterName(config.name, 'dataTableName'),
      stringValue: this.table.tableName,
      description: 'DynamoDB single-table name (posts + notebook)',
    });
    new StringParameter(this, 'TableArnParam', {
      parameterName: ssmParameterName(config.name, 'dataTableArn'),
      stringValue: this.table.tableArn,
      description: 'DynamoDB single-table ARN',
    });
    new StringParameter(this, 'TableStreamArnParam', {
      parameterName: ssmParameterName(config.name, 'dataTableStreamArn'),
      stringValue: this.table.tableStreamArn!,
      description: 'DynamoDB stream ARN for the publisher',
    });

    new CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB table for posts and notebook',
    });
    new CfnOutput(this, 'TableStreamArn', {
      value: this.table.tableStreamArn!,
      description: 'DynamoDB stream ARN (NEW_AND_OLD_IMAGES)',
    });
  }
}
