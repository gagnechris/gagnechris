import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  StreamViewType,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';
import { APP_TABLE, type DynamoAttributeTypeCode } from '@gagnechris/data';
import { ssmParameterName } from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';

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

export interface DataStackProps extends StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * Single-table DynamoDB for Blog CMS posts and future Notebook entities.
 * Schema: `@gagnechris/data` {@link APP_TABLE}. Access patterns: docs/data-model.md
 */
export class DataStack extends Stack {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { config } = props;
    const def = APP_TABLE;

    this.table = new Table(this, 'AppTable', {
      tableName: `gagnechris-${config.name}`,
      partitionKey: {
        name: def.partitionKey.name,
        type: toCdkAttrType(def.partitionKey.type),
      },
      sortKey: {
        name: def.sortKey.name,
        type: toCdkAttrType(def.sortKey.type),
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      deletionProtection: true,
      removalPolicy: config.statefulRemovalPolicy,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      // Rate-limit counters (CHR-98); contact messages do not set ttl.
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

    // Prefer RETAIN even if a future env flips statefulRemovalPolicy.
    this.table.applyRemovalPolicy(RemovalPolicy.RETAIN);

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
