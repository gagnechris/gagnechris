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
import type { EnvironmentConfig } from '../config/environments.js';

export interface DataStackProps extends StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * Single-table DynamoDB for Blog CMS posts and future Notebook entities.
 * Access patterns: docs/data-model.md
 */
export class DataStack extends Stack {
  readonly table: Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.table = new Table(this, 'AppTable', {
      tableName: `gagnechris-${config.name}`,
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      deletionProtection: true,
      removalPolicy: config.statefulRemovalPolicy,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // GSI1: list by status (admin + published-by-date). See docs/data-model.md.
    this.table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: AttributeType.STRING },
    });

    // GSI2: list published posts by tag.
    this.table.addGlobalSecondaryIndex({
      indexName: 'gsi2',
      partitionKey: { name: 'gsi2pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: AttributeType.STRING },
    });

    // Prefer RETAIN even if a future env flips statefulRemovalPolicy.
    this.table.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const paramPrefix = `/gagnechris/${config.name}`;
    new StringParameter(this, 'TableNameParam', {
      parameterName: `${paramPrefix}/data-table-name`,
      stringValue: this.table.tableName,
      description: 'DynamoDB single-table name (posts + notebook)',
    });
    new StringParameter(this, 'TableArnParam', {
      parameterName: `${paramPrefix}/data-table-arn`,
      stringValue: this.table.tableArn,
      description: 'DynamoDB single-table ARN',
    });
    new StringParameter(this, 'TableStreamArnParam', {
      parameterName: `${paramPrefix}/data-table-stream-arn`,
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
