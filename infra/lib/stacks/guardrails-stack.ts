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
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
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

export interface GuardrailsStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /** Monthly cost budget in USD (default $20). */
  readonly monthlyBudgetUsd?: number;
  /** Days before CloudTrail objects expire (default 90). */
  readonly trailRetentionDays?: number;
}

/**
 * Cost and security baseline: SNS alerts, Budgets, CloudTrail, account S3 BPA,
 * and IAM Access Analyzer.
 */
export class GuardrailsStack extends Stack {
  readonly alertsTopic: Topic;

  constructor(scope: Construct, id: string, props: GuardrailsStackProps) {
    super(scope, id, props);

    const {
      config,
      monthlyBudgetUsd = 20,
      trailRetentionDays = 90,
    } = props;
    const email = config.alertsEmail;

    this.alertsTopic = new Topic(this, 'Alerts', {
      displayName: `gagnechris-${config.name}-alerts`,
      enforceSSL: true,
    });
    this.alertsTopic.addSubscription(new EmailSubscription(email));

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
      // Skip CloudWatch Logs delivery to limit cost; S3 + validation is enough.
      sendToCloudWatchLogs: false,
      managementEvents: ReadWriteType.ALL,
    });

    const budgetName = `gagnechris-${config.name}-monthly`;
    const emailSubscriber = {
      subscriptionType: 'EMAIL',
      address: email,
    };
    const snsSubscriber = {
      subscriptionType: 'SNS',
      address: this.alertsTopic.topicArn,
    };

    const actualThresholds = [50, 80, 100];
    new CfnBudget(this, 'MonthlyCostBudget', {
      budget: {
        budgetName,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: monthlyBudgetUsd,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        ...actualThresholds.map((threshold) => ({
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [emailSubscriber, snsSubscriber],
        })),
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [emailSubscriber, snsSubscriber],
        },
      ],
    });

    // No native CFN type for account-level S3 BPA — call S3 Control via SDK.
    const accountBpa = new AwsCustomResource(this, 'AccountS3BlockPublicAccess', {
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
    });

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
      description: `Monthly COST budget (${monthlyBudgetUsd} USD).`,
    });
  }
}
