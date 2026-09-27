import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Architecture,
  FilterCriteria,
  FilterRule,
  Runtime,
  StartingPosition,
  Tracing,
} from 'aws-cdk-lib/aws-lambda';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import { APEX_DOMAIN } from './dns-stack.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../..');

export interface PublisherStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly dataTable: ITable;
  readonly siteBucket: IBucket;
  readonly distribution: IDistribution;
  readonly alertsTopic: ITopic;
}

/**
 * DynamoDB Streams → Publisher Lambda → S3 static blog + CloudFront invalidation.
 */
export class PublisherStack extends Stack {
  readonly publisherFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: PublisherStackProps) {
    super(scope, id, props);

    const { config, dataTable, siteBucket, distribution, alertsTopic } = props;

    const logGroup = new LogGroup(this, 'PublisherLogGroup', {
      retention: RetentionDays.TWO_WEEKS,
    });

    this.publisherFunction = new NodejsFunction(this, 'PublisherFunction', {
      functionName: `gagnechris-${config.name}-publisher`,
      description:
        'Render published posts to S3 (HTML, posts.json, sitemap, RSS) and invalidate CloudFront',
      entry: join(repoRoot, 'services/publisher/src/handler.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(60),
      tracing: Tracing.ACTIVE,
      logGroup,
      depsLockFilePath: join(repoRoot, 'package-lock.json'),
      projectRoot: repoRoot,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node24',
        externalModules: ['@aws-sdk/*'],
        commandHooks: {
          beforeBundling(): string[] {
            return [];
          },
          beforeInstall(): string[] {
            return [];
          },
          afterBundling(inputDir: string, outputDir: string): string[] {
            const fontsSrc = join(
              inputDir,
              'services/publisher/assets/fonts',
            );
            return [
              `mkdir -p "${outputDir}/assets/fonts"`,
              `cp "${fontsSrc}/Inter-Regular.ttf" "${fontsSrc}/Inter-Bold.ttf" "${outputDir}/assets/fonts/"`,
            ];
          },
        },
      },
      environment: {
        POWERTOOLS_SERVICE_NAME: 'gagnechris-publisher',
        POWERTOOLS_METRICS_NAMESPACE: 'gagnechris',
        NODE_OPTIONS: '--enable-source-maps',
        DATA_TABLE_NAME: dataTable.tableName,
        SITE_BUCKET_NAME: siteBucket.bucketName,
        CLOUDFRONT_DISTRIBUTION_ID: distribution.distributionId,
        SITE_APEX_DOMAIN: APEX_DOMAIN,
      },
    });

    dataTable.grantReadData(this.publisherFunction);
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

    this.publisherFunction.addEventSource(
      new DynamoEventSource(dataTable, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 10,
        bisectBatchOnError: true,
        retryAttempts: 3,
        reportBatchItemFailures: true,
        filters: [
          FilterCriteria.filter({
            dynamodb: {
              Keys: {
                sk: { S: FilterRule.isEqual('META') },
              },
            },
          }),
        ],
      }),
    );

    NagSuppressions.addResourceSuppressions(
      this.publisherFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'NodejsFunction uses AWSLambdaBasicExecutionRole for CloudWatch Logs.',
          appliesTo: [
            'Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          ],
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Publisher reads/writes site objects under the bucket and uses X-Ray tracing wildcards required by the managed tracing pattern.',
        },
      ],
      true,
    );

    new Alarm(this, 'PublisherLambdaErrors', {
      alarmName: `gagnechris-${config.name}-publisher-lambda-errors`,
      alarmDescription: 'Publisher Lambda errors > 0 in 5 minutes',
      metric: this.publisherFunction.metricErrors({
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new SnsAction(alertsTopic));

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

    const paramPrefix = `/gagnechris/${config.name}`;
    new StringParameter(this, 'PublisherFunctionNameParam', {
      parameterName: `${paramPrefix}/publisher-function-name`,
      stringValue: this.publisherFunction.functionName,
      description: 'Publisher Lambda name (republish-all from web deploy)',
    });
    new StringParameter(this, 'PublisherFunctionArnParam', {
      parameterName: `${paramPrefix}/publisher-function-arn`,
      stringValue: this.publisherFunction.functionArn,
      description: 'Publisher Lambda ARN',
    });

    new CfnOutput(this, 'PublisherFunctionName', {
      value: this.publisherFunction.functionName,
      description: 'Invoke with {"action":"republishAll"} after web shell deploys',
    });
  }
}
