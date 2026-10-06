import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
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
import {
  GSI1_NAME,
  PUBLISH_STREAM_SK,
  projectStatusGsi1Pk,
  sitePublishPk,
  statusGsi1Pk,
} from '@gagnechris/data';
import {
  PUBLISHER_SERVICE_NAME,
  ssmParameterName,
} from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';
import { emfServiceAlarm } from '../constructs/emf-alarm.js';
import {
  LambdaFailureDestination,
  NodeLambda,
  REPO_ROOT,
} from '../constructs/node-lambda.js';

export const PUBLISHER_TABLE_LEADING_KEYS = [
  'POST#*',
  'HOME#*',
  'RESUME#*',
  'PROJECT#*',
  sitePublishPk(),
];

export const PUBLISHER_GSI1_LEADING_KEYS = [
  statusGsi1Pk('published'),
  projectStatusGsi1Pk('published'),
];

/** For an index, `dynamodb:LeadingKeys` is the index partition key. */
export function publisherTableReadStatements(
  tableArn: string,
): PolicyStatement[] {
  return [
    new PolicyStatement({
      sid: 'PublisherReadPublishedItems',
      actions: ['dynamodb:GetItem', 'dynamodb:BatchGetItem'],
      resources: [tableArn],
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': PUBLISHER_TABLE_LEADING_KEYS,
        },
      },
    }),
    new PolicyStatement({
      sid: 'PublisherQueryPublishedIndex',
      actions: ['dynamodb:Query'],
      resources: [`${tableArn}/index/${GSI1_NAME}`],
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': PUBLISHER_GSI1_LEADING_KEYS,
        },
      },
    }),
  ];
}

export interface PublisherStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly dataTable: ITable;
  readonly alertsTopic: ITopic;
}

export class PublisherStack extends Stack {
  readonly publisherFunction: NodeLambda;
  readonly streamFailureDestination: LambdaFailureDestination;

  constructor(scope: Construct, id: string, props: PublisherStackProps) {
    super(scope, id, props);

    const { config, dataTable, alertsTopic } = props;

    // SSM rather than Site CFN exports.
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
    // domainName is required but unused (invalidations need only the id).
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
      powertoolsServiceName: PUBLISHER_SERVICE_NAME,
      alertsTopic,
      alarmNamePrefix: `gagnechris-${config.name}-publisher`,
      iam5NagReason:
        'Publisher reads/writes site objects under the bucket, stream ListStreams *, and uses X-Ray tracing wildcards required by the managed tracing pattern. DynamoDB access is read-only and scoped by dynamodb:LeadingKeys.',
      iam5NagAppliesTo: [
        'Resource::*',
        'Action::s3:Abort*',
        'Action::s3:DeleteObject*',
        'Action::s3:GetBucket*',
        'Action::s3:GetObject*',
        'Action::s3:List*',
        { regex: '/^Resource::arn:<AWS::Partition>:s3:::.*/g' },
      ],
      bundling: {
        // Bundle CloudFront KeyValueStore + SigV4a so they share one
        // @smithy/signature-v4 singleton; the runtime provides the rest.
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
              `cp "${fontsSrc}"/*.ttf "${fontsSrc}"/*-OFL.txt "${outputDir}/assets/fonts/"`,
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

    // LeadingKeys keeps the publisher away from notebook (USER#...) and
    // contact data; it writes nothing to the table.
    for (const statement of publisherTableReadStatements(dataTable.tableArn)) {
      this.publisherFunction.addToRolePolicy(statement);
    }
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
        // The handler rebuilds from the whole batch, so there are no partial
        // batchItemFailures to report.
        onFailure: this.streamFailureDestination.streamDestination,
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

    // PDF failures do not fail the rebuild, so Lambda Errors stays quiet.
    emfServiceAlarm(this, 'PublisherResumePdfErrors', {
      alarmName: `gagnechris-${config.name}-publisher-resume-pdf-errors`,
      alarmDescription:
        'Resume PDF generation failed during site rebuild (last good PDF kept)',
      serviceName: PUBLISHER_SERVICE_NAME,
      metricName: 'ResumePdfError',
      alertsTopic,
    });

    // These also fail the invocation; the metric makes alerts name the cause.
    emfServiceAlarm(this, 'PublisherKvsSyncFailed', {
      alarmName: `gagnechris-${config.name}-publisher-kvs-sync-failed`,
      alarmDescription:
        'CloudFront KVS blog slug sync failed after retries (new posts may 404)',
      serviceName: PUBLISHER_SERVICE_NAME,
      metricName: 'KvsSyncFailed',
      alertsTopic,
    });

    // Corrupt rows keep the live page, so nothing else surfaces them.
    emfServiceAlarm(this, 'PublisherDataIntegrityErrors', {
      alarmName: `gagnechris-${config.name}-publisher-data-integrity`,
      alarmDescription:
        'Publisher skipped a corrupt PUBLISHED row (live page may be stale)',
      serviceName: PUBLISHER_SERVICE_NAME,
      metricName: 'DataIntegrityError',
      alertsTopic,
    });

    // A rebuild that never saw the same publish generation twice may have
    // left an index from stale data until the next publish.
    emfServiceAlarm(this, 'PublisherRebuildUnsettled', {
      alarmName: `gagnechris-${config.name}-publisher-rebuild-unsettled`,
      alarmDescription:
        'Publisher gave up after max passes while publishes kept landing (run republishAll if the site looks stale)',
      serviceName: PUBLISHER_SERVICE_NAME,
      metricName: 'RebuildUnsettled',
      alertsTopic,
    });

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
