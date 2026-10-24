import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import { CfnAnalyzer } from 'aws-cdk-lib/aws-accessanalyzer';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import { ReadWriteType, Trail } from 'aws-cdk-lib/aws-cloudtrail';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
  StorageClass,
} from 'aws-cdk-lib/aws-s3';
import { Topic, CfnSubscription } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import { ssmParameterName } from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';

const PROJECT_TAG_KEY = 'project';
// Every application in the account; each one tags its stacks `project=<name>`.
const ACCOUNT_PROJECTS = ['gagnechris', 'extracredit'] as const;
const COST_ALLOCATION_BACKFILL_FROM = '2026-09-01T00:00:00Z';

export interface GuardrailsStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly monthlyBudgetUsd?: number;
  readonly unattributedMonthlyBudgetUsd?: number;
  readonly trailRetentionDays?: number;
}

export class GuardrailsStack extends Stack {
  readonly alertsTopic: Topic;

  constructor(scope: Construct, id: string, props: GuardrailsStackProps) {
    super(scope, id, props);

    const {
      config,
      monthlyBudgetUsd = 25,
      unattributedMonthlyBudgetUsd = 5,
      trailRetentionDays = 90,
    } = props;
    const email = config.alertsEmail;

    this.alertsTopic = new Topic(this, 'Alerts', {
      displayName: `gagnechris-${config.name}-alerts`,
      enforceSSL: true,
    });
    // Keep this logical id: the subscription behind the previous id was deleted
    // outside CloudFormation. A new id needs the SNS email confirmed again.
    new CfnSubscription(this, 'AlertsEmailV2', {
      topicArn: this.alertsTopic.topicArn,
      protocol: 'email',
      endpoint: email,
    });

    this.alertsTopic.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowAwsBudgetsPublish',
        principals: [new ServicePrincipal('budgets.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.alertsTopic.topicArn],
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: {
            'aws:SourceArn': `arn:aws:budgets::${this.account}:*`,
          },
        },
      }),
    );

    this.alertsTopic.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowCloudWatchAlarmsPublish',
        principals: [new ServicePrincipal('cloudwatch.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.alertsTopic.topicArn],
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
        },
      }),
    );

    NagSuppressions.addResourceSuppressions(this.alertsTopic, [
      {
        id: 'AwsSolutions-SNS2',
        reason:
          'Default AWS-managed SNS encryption is enough for alert fan-out; customer-managed KMS adds cost for a personal account.',
      },
    ]);

    const trailBucket = new Bucket(this, 'CloudTrailLogs', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: config.statefulRemovalPolicy,
      autoDeleteObjects: config.statefulRemovalPolicy === RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'ExpireCloudTrailObjects',
          enabled: true,
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
          expiration: Duration.days(trailRetentionDays),
          noncurrentVersionExpiration: Duration.days(30),
        },
      ],
    });

    NagSuppressions.addResourceSuppressions(trailBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'This bucket is the CloudTrail log destination; adding access logging would recurse into another log bucket for little gain on a personal account.',
      },
    ]);

    new Trail(this, 'AccountTrail', {
      bucket: trailBucket,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      enableFileValidation: true,
      // Cost: S3 + file validation is enough.
      sendToCloudWatchLogs: false,
      managementEvents: ReadWriteType.ALL,
    });

    // Budget tag filters only see a tag once it is an active cost allocation
    // tag; there is no CloudFormation type for that account setting.
    const costAllocationTag = new AwsCustomResource(
      this,
      'ProjectCostAllocationTag',
      {
        installLatestAwsSdk: false,
        onCreate: {
          service: 'CostExplorer',
          action: 'updateCostAllocationTagsStatus',
          parameters: {
            CostAllocationTagsStatus: [
              { TagKey: PROJECT_TAG_KEY, Status: 'Active' },
            ],
          },
          physicalResourceId: PhysicalResourceId.of(
            `ProjectCostAllocationTag-${this.account}`,
          ),
        },
        onUpdate: {
          service: 'CostExplorer',
          action: 'updateCostAllocationTagsStatus',
          parameters: {
            CostAllocationTagsStatus: [
              { TagKey: PROJECT_TAG_KEY, Status: 'Active' },
            ],
          },
          physicalResourceId: PhysicalResourceId.of(
            `ProjectCostAllocationTag-${this.account}`,
          ),
        },
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['ce:UpdateCostAllocationTagsStatus'],
            resources: ['*'],
          }),
        ]),
      },
    );

    // Activation only tags spend from then on. Without the backfill the
    // unattributed budget counts the whole current month as untagged.
    const costAllocationBackfill = new AwsCustomResource(
      this,
      'ProjectCostAllocationBackfill',
      {
        installLatestAwsSdk: false,
        onCreate: {
          service: 'CostExplorer',
          action: 'startCostAllocationTagBackfill',
          parameters: { BackfillFrom: COST_ALLOCATION_BACKFILL_FROM },
          physicalResourceId: PhysicalResourceId.of(
            `ProjectCostAllocationBackfill-${this.account}`,
          ),
        },
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['ce:StartCostAllocationTagBackfill'],
            resources: ['*'],
          }),
        ]),
      },
    );
    costAllocationBackfill.node.addDependency(costAllocationTag);

    for (const resource of [costAllocationTag, costAllocationBackfill]) {
      NagSuppressions.addResourceSuppressions(
        resource,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason:
              'Cost allocation tag actions are account-scoped and require Resource "*".',
          },
        ],
        true,
      );
    }

    const budgetName = `gagnechris-${config.name}-monthly`;
    const unattributedBudgetName = `account-unattributed-monthly`;
    const subscribers = [
      { subscriptionType: 'EMAIL', address: email },
      { subscriptionType: 'SNS', address: this.alertsTopic.topicArn },
    ];
    const notificationsWithSubscribers = [
      ...[50, 80, 100].map((threshold) => ({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold,
          thresholdType: 'PERCENTAGE',
        },
        subscribers,
      })),
      {
        notification: {
          notificationType: 'FORECASTED',
          comparisonOperator: 'GREATER_THAN',
          threshold: 100,
          thresholdType: 'PERCENTAGE',
        },
        subscribers,
      },
    ];

    const projectBudget = new CfnBudget(this, 'MonthlyCostBudget', {
      budget: {
        budgetName,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: monthlyBudgetUsd,
          unit: 'USD',
        },
        filterExpression: {
          tags: {
            key: PROJECT_TAG_KEY,
            values: ['gagnechris'],
            matchOptions: ['EQUALS'],
          },
        },
      },
      notificationsWithSubscribers,
    });
    projectBudget.node.addDependency(costAllocationTag);

    // Each application in the account budgets its own `project` tag; this
    // catches the rest. Domain renewals are known yearly charges, and tax
    // follows the other lines, so neither counts here.
    const unattributedBudget = new CfnBudget(this, 'UnattributedCostBudget', {
      budget: {
        budgetName: unattributedBudgetName,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: unattributedMonthlyBudgetUsd,
          unit: 'USD',
        },
        filterExpression: {
          and: [
            {
              not: {
                tags: {
                  key: PROJECT_TAG_KEY,
                  values: [...ACCOUNT_PROJECTS],
                  matchOptions: ['EQUALS'],
                },
              },
            },
            {
              not: {
                dimensions: {
                  key: 'SERVICE',
                  values: ['Amazon Registrar', 'Tax'],
                  matchOptions: ['EQUALS'],
                },
              },
            },
          ],
        },
      },
      notificationsWithSubscribers,
    });
    unattributedBudget.node.addDependency(costAllocationBackfill);

    // No native CFN type for account-level S3 BPA.
    const accountBpa = new AwsCustomResource(
      this,
      'AccountS3BlockPublicAccess',
      {
        installLatestAwsSdk: false,
        onCreate: {
          service: 'S3Control',
          action: 'putPublicAccessBlock',
          parameters: {
            AccountId: this.account,
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              IgnorePublicAcls: true,
              BlockPublicPolicy: true,
              RestrictPublicBuckets: true,
            },
          },
          physicalResourceId: PhysicalResourceId.of(
            `AccountS3BlockPublicAccess-${this.account}`,
          ),
        },
        onUpdate: {
          service: 'S3Control',
          action: 'putPublicAccessBlock',
          parameters: {
            AccountId: this.account,
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              IgnorePublicAcls: true,
              BlockPublicPolicy: true,
              RestrictPublicBuckets: true,
            },
          },
          physicalResourceId: PhysicalResourceId.of(
            `AccountS3BlockPublicAccess-${this.account}`,
          ),
        },
        // Leave account BPA in place if the stack is deleted.
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
              's3:PutAccountPublicAccessBlock',
              's3:GetAccountPublicAccessBlock',
            ],
            resources: ['*'],
          }),
        ]),
      },
    );

    NagSuppressions.addResourceSuppressions(
      accountBpa,
      [
        {
          id: 'AwsSolutions-L1',
          reason:
            'AwsCustomResource manages the Lambda runtime; we accept the CDK provider default.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'PutAccountPublicAccessBlock is account-scoped and requires Resource "*".',
        },
      ],
      true,
    );

    // Provider singleton lives outside the AwsCustomResource construct tree.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${Stack.of(this).stackName}/AWS679f53fac002430cb0da5b7982bd2287/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'AwsCustomResource provider uses AWSLambdaBasicExecutionRole for CloudWatch Logs; scoping further is not supported by the L2.',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          ],
        },
      ],
    );

    new CfnAnalyzer(this, 'AccountAccessAnalyzer', {
      analyzerName: `gagnechris-${config.name}-account`,
      type: 'ACCOUNT',
    });

    new StringParameter(this, 'AlertsTopicArnParam', {
      parameterName: ssmParameterName(config.name, 'alertsTopicArn'),
      stringValue: this.alertsTopic.topicArn,
    });

    new CfnOutput(this, 'AlertsTopicArn', {
      value: this.alertsTopic.topicArn,
      description: 'SNS topic for operational alerts (subscribe alarms here).',
    });

    new CfnOutput(this, 'CloudTrailBucketName', {
      value: trailBucket.bucketName,
      description: 'S3 bucket receiving multi-region CloudTrail logs.',
    });

    new CfnOutput(this, 'MonthlyBudgetName', {
      value: budgetName,
      description: `Monthly COST budget for project=gagnechris (${monthlyBudgetUsd} USD).`,
    });

    new CfnOutput(this, 'UnattributedBudgetName', {
      value: unattributedBudgetName,
      description: `Monthly COST budget for spend outside every project tag (${unattributedMonthlyBudgetUsd} USD).`,
    });
  }
}
