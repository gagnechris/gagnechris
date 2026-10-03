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
  assertAppTableGsiUpdateSafe,
  type DynamoAttributeTypeCode,
} from '@gagnechris/data';
import { ssmParameterName } from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';
import { metricAlarm } from '../constructs/emf-alarm.js';

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

/** App-table operations we actually use (CHR-168 DynamoDB alarms). */
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
}

/**
 * Single-table DynamoDB for Blog CMS posts and future Notebook entities.
 * Schema: `@gagnechris/data` {@link APP_TABLE}. Access patterns: docs/data-model.md
 */
/** Rolling retention for AWS Backup recovery points (CHR-197). */
export const BACKUP_RETENTION_DAYS = 7;
const BACKUP_FAILURE_STATES = ['FAILED', 'ABORTED', 'EXPIRED', 'PARTIAL'];

export class DataStack extends Stack {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // Offline guard at synth time (CHR-174). PR CDK also runs
    // `npm run check:deployed-gsi` against the live table.
    assertAppTableGsiUpdateSafe(LAST_DEPLOYED_GSIS);

    const { config, alertsTopic } = props;
    const def = APP_TABLE;

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
      });
    }

    this.table.applyRemovalPolicy(RemovalPolicy.RETAIN);

    // AWS Backup beyond PITR (CHR-175 / CHR-197): daily snapshots kept for a
    // rolling 7 days. The vault lock is governance mode (no `changeableFor`):
    // it blocks shortening retention or deleting recovery points early, but an
    // admin can still change or remove it. Setting `changeableFor` would make
    // it compliance mode, which becomes permanent once that window ends.
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
          'Vault uses AWS-owned key; customer-managed KMS is a follow-up if Notebook data classification requires it (CHR-175).',
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
            'AWS Backup selection uses the AWS-managed Backup/Restore service-role policies required by the Backup service; custom least-privilege replicas drift from AWS updates (CHR-175).',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup',
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores',
          ],
        },
      ],
      true,
    );

    // Failed, aborted, expired or partial backup/restore/copy jobs email the
    // Guardrails topic (CHR-197). The three event types name their fields
    // differently: restore jobs report `status` (not `state`) and carry no
    // `backupVaultName`, and copy jobs only name the source/destination vault
    // ARNs. Hence one `$or` branch per type, keyed on fields each one has.
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
          ],
        },
      },
      targets: [new SnsTopic(alertsTopic)],
    });

    metricAlarm(this, 'AppTableSystemErrors', {
      alarmName: `gagnechris-${config.name}-dynamodb-system-errors`,
      alarmDescription:
        'DynamoDB AppTable SystemErrors ≥ 1 in 5 minutes (CHR-168)',
      metric: this.table.metricSystemErrorsForOperations({
        operations: APP_TABLE_OPERATIONS,
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      alertsTopic,
    });
    metricAlarm(this, 'AppTableThrottledRequests', {
      alarmName: `gagnechris-${config.name}-dynamodb-throttled-requests`,
      alarmDescription:
        'DynamoDB AppTable ThrottledRequests ≥ 1 in 5 minutes (CHR-168)',
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
      description: 'DynamoDB stream ARN for the publisher (CHR-34)',
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
