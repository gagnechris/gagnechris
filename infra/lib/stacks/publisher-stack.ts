import {
  CfnOutput,
  CfnResource,
  Duration,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  FilterCriteria,
  FilterRule,
  StartingPosition,
} from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { join } from 'node:path';
import type { Construct } from 'constructs';
import { ssmParameterName } from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';
import {
  LambdaFailureDestination,
  NodeLambda,
  REPO_ROOT,
} from '../constructs/node-lambda.js';
import { PUBLISH_STREAM_SK } from '@gagnechris/data';

export interface PublisherStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly dataTable: ITable;
  readonly alertsTopic: ITopic;
}

/**
 * DynamoDB Streams → Publisher Lambda → S3 static blog + CloudFront invalidation.
 * Site bucket, distribution, and blog-slugs KVS are resolved from SSM (CHR-149)
 * so Publisher does not import Site CloudFormation exports.
 */
export class PublisherStack extends Stack {
  readonly publisherFunction: NodeLambda;
  /** On-failure SQS destination for discarded stream records (CHR-134). */
  readonly streamFailureDestination: LambdaFailureDestination;

  constructor(scope: Construct, id: string, props: PublisherStackProps) {
    super(scope, id, props);

    const { config, dataTable, alertsTopic } = props;

    // Site writes these SSM params; Publisher looks them up (no CFN exports).
    const siteBucketName = StringParameter.valueForStringParameter(
      this,
      ssmParameterName(config.name, 'siteBucketName'),
    );
    const distributionId = StringParameter.valueForStringParameter(
      this,
      ssmParameterName(config.name, 'cloudfrontDistributionId'),
    );
    const blogSlugsKeyValueStoreArn = StringParameter.valueForStringParameter(
      this,
      ssmParameterName(config.name, 'blogSlugsKvsArn'),
    );

    const siteBucket = Bucket.fromBucketName(
      this,
      'SiteBucket',
      siteBucketName,
    );
    // domainName is required by fromDistributionAttributes; Publisher only uses
    // distributionId (invalidations). Apex is a stable stand-in.
    const distribution = Distribution.fromDistributionAttributes(
      this,
      'SiteDistribution',
      {
        distributionId,
        domainName: config.domainName,
      },
    );

    this.publisherFunction = new NodeLambda(this, 'PublisherFunction', {
      functionName: `gagnechris-${config.name}-publisher`,
      description:
        'Render published posts to S3 (HTML, posts.json, sitemap, RSS) and invalidate CloudFront',
      entry: join(REPO_ROOT, 'services/publisher/src/handler.ts'),
      handler: 'handler',
      memorySize: 512,
      timeout: Duration.seconds(60),
      powertoolsServiceName: 'gagnechris-publisher',
      alertsTopic,
      alarmNamePrefix: `gagnechris-${config.name}-publisher`,
      createErrorsAlarm: false,
      iam5NagReason:
        'Publisher reads/writes site objects under the bucket, writes lazy META→PUBLISHED DynamoDB copies (CHR-96), and uses X-Ray tracing wildcards required by the managed tracing pattern.',
      bundling: {
        // Runtime provides most @aws-sdk/* clients. Bundle only CloudFront
        // KeyValueStore + SigV4a so they share one @smithy/signature-v4
        // singleton (CHR-115); externalize the rest to shrink the zip (CHR-122).
        externalModules: [
          '@aws-sdk/client-dynamodb',
          '@aws-sdk/lib-dynamodb',
          '@aws-sdk/client-s3',
          '@aws-sdk/client-cloudfront',
          '@aws-sdk/util-dynamodb',
        ],
        commandHooks: {
          beforeBundling(): string[] {
            return [];
          },
          beforeInstall(): string[] {
            return [];
          },
          afterBundling(inputDir: string, outputDir: string): string[] {
            const fontsSrc = join(inputDir, 'services/publisher/assets/fonts');
            return [
              `mkdir -p "${outputDir}/assets/fonts"`,
              `cp "${fontsSrc}/Inter-Regular.ttf" "${fontsSrc}/Inter-Bold.ttf" "${outputDir}/assets/fonts/"`,
            ];
          },
        },
      },
      environment: {
        DATA_TABLE_NAME: dataTable.tableName,
        SITE_BUCKET_NAME: siteBucketName,
        CLOUDFRONT_DISTRIBUTION_ID: distributionId,
        BLOG_SLUGS_KVS_ARN: blogSlugsKeyValueStoreArn,
        SITE_APEX_DOMAIN: config.domainName,
      },
    });

    const publisherErrorsAlarm = new Alarm(this, 'PublisherLambdaErrors', {
      alarmName: `gagnechris-${config.name}-publisher-lambda-errors`,
      alarmDescription: 'Publisher Lambda Errors > 0',
      metric: this.publisherFunction.metricErrors({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    // Live Publisher-prod already uses this hashed logical ID (same AlarmName
    // collision as Api). Keep it so CFN updates in place.
    (publisherErrorsAlarm.node.defaultChild as CfnResource).overrideLogicalId(
      'PublisherLambdaErrors71132C5B',
    );
    publisherErrorsAlarm.addAlarmAction(new SnsAction(alertsTopic));

    // Read published snapshots + write lazy META→PUBLISHED rollout copies (CHR-96).
    dataTable.grantReadWriteData(this.publisherFunction);
    dataTable.grantStreamRead(this.publisherFunction);
    siteBucket.grantReadWrite(this.publisherFunction);

    this.publisherFunction.addToRolePolicy(
      new PolicyStatement({
        sid: 'CloudFrontInvalidate',
        actions: ['cloudfront:CreateInvalidation'],
        resources: [
          `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        ],
      }),
    );

    this.publisherFunction.addToRolePolicy(
      new PolicyStatement({
        sid: 'CloudFrontBlogSlugsKvs',
        actions: [
          'cloudfront-keyvaluestore:DescribeKeyValueStore',
          'cloudfront-keyvaluestore:ListKeys',
          'cloudfront-keyvaluestore:UpdateKeys',
          'cloudfront-keyvaluestore:GetKey',
        ],
        resources: [blogSlugsKeyValueStoreArn],
      }),
    );

    this.streamFailureDestination = new LambdaFailureDestination(
      this,
      'StreamFailures',
      {
        alertsTopic,
        depthAlarmName: `gagnechris-${config.name}-publisher-stream-dlq-depth`,
        queueName: `gagnechris-${config.name}-publisher-stream-failures`,
      },
    );

    this.publisherFunction.addEventSource(
      new DynamoEventSource(dataTable, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 10,
        bisectBatchOnError: true,
        retryAttempts: 3,
        reportBatchItemFailures: true,
        onFailure: this.streamFailureDestination.destination,
        filters: [
          FilterCriteria.filter({
            dynamodb: {
              Keys: {
                sk: { S: FilterRule.isEqual(PUBLISH_STREAM_SK) },
              },
            },
          }),
        ],
      }),
    );

    // PDF failures are isolated from the rebuild (CHR-97) so Lambda Errors
    // stays quiet; alert on the dedicated EMF metric instead.
    new Alarm(this, 'PublisherResumePdfErrors', {
      alarmName: `gagnechris-${config.name}-publisher-resume-pdf-errors`,
      alarmDescription:
        'Resume PDF generation failed during site rebuild (last good PDF kept)',
      metric: new Metric({
        namespace: 'gagnechris',
        metricName: 'ResumePdfError',
        dimensionsMap: { service: 'gagnechris-publisher' },
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new SnsAction(alertsTopic));

    // KVS slug sync failures also fail the invocation (stream retries), but
    // surface a dedicated metric so alerts name the root cause (CHR-119).
    new Alarm(this, 'PublisherKvsSyncFailed', {
      alarmName: `gagnechris-${config.name}-publisher-kvs-sync-failed`,
      alarmDescription:
        'CloudFront KVS blog slug sync failed after retries (new posts may 404)',
      metric: new Metric({
        namespace: 'gagnechris',
        metricName: 'KvsSyncFailed',
        dimensionsMap: { service: 'gagnechris-publisher' },
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new SnsAction(alertsTopic));

    new StringParameter(this, 'PublisherFunctionNameParam', {
      parameterName: ssmParameterName(config.name, 'publisherFunctionName'),
      stringValue: this.publisherFunction.functionName,
      description: 'Publisher Lambda name (republish-all from web deploy)',
    });
    new StringParameter(this, 'PublisherFunctionArnParam', {
      parameterName: ssmParameterName(config.name, 'publisherFunctionArn'),
      stringValue: this.publisherFunction.functionArn,
      description: 'Publisher Lambda ARN',
    });

    new CfnOutput(this, 'PublisherFunctionName', {
      value: this.publisherFunction.functionName,
      description:
        'Invoke with {"action":"republishAll"} after web shell deploys',
    });
  }
}
