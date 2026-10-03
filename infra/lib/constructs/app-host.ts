import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  Alarm,
  ComparisonOperator,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import {
  AllowedMethods,
  CachedMethods,
  type BehaviorOptions,
  type ICachePolicy,
  type IFunction,
  type IResponseHeadersPolicy,
  Distribution,
  FunctionEventType,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  type ResponseSecurityHeadersBehavior,
  S3OriginAccessControl,
  SecurityPolicyProtocol,
  Signing,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  type IBucket,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import { type SsmParamKey, ssmParameterName } from '../config/constants.js';

export interface AppHostProps {
  readonly config: EnvironmentConfig;
  /** Short name used in resource names and log prefixes (`admin`, `notebook`). */
  readonly appName: string;
  readonly domainName: string;
  readonly certificate: ICertificate;
  readonly accessLogs: IBucket;
  readonly alertsTopic: ITopic;
  readonly securityHeadersBehavior: ResponseSecurityHeadersBehavior;
  readonly viewerRequestFunction: IFunction;
  readonly htmlCachePolicy: ICachePolicy;
  readonly assetsCachePolicy: ICachePolicy;
  readonly apiBehavior: BehaviorOptions;
  /** Extra path behaviours; they get this host's response headers policy. */
  readonly additionalBehaviors?: (
    responseHeadersPolicy: IResponseHeadersPolicy,
  ) => Record<string, BehaviorOptions>;
  readonly bucketParamKey: SsmParamKey;
  readonly distributionParamKey: SsmParamKey;
}

/**
 * A signed-in app on its own hostname: private bucket, distribution with a
 * strict CSP, same-origin /api, and an SPA fallback.
 */
export class AppHost extends Construct {
  readonly bucket: Bucket;
  readonly distribution: Distribution;
  readonly responseHeadersPolicy: ResponseHeadersPolicy;

  constructor(scope: Construct, id: string, props: AppHostProps) {
    super(scope, id);

    const { config, appName } = props;
    const namePrefix = `gagnechris-${config.name}-${appName}`;

    // Build output only, rebuilt from git on every deploy, so no AWS Backup.
    this.bucket = new Bucket(this, 'Bucket', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      serverAccessLogsBucket: props.accessLogs,
      serverAccessLogsPrefix: `s3-${appName}/`,
      removalPolicy: config.statefulRemovalPolicy,
      autoDeleteObjects: config.statefulRemovalPolicy === RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'ExpireNoncurrentVersions',
          enabled: true,
          noncurrentVersionExpiration: Duration.days(90),
        },
      ],
    });

    const origin = S3BucketOrigin.withOriginAccessControl(this.bucket, {
      originAccessControl: new S3OriginAccessControl(this, 'Oac', {
        description: `OAC for gagnechris ${config.name} ${props.domainName}`,
        signing: Signing.SIGV4_ALWAYS,
      }),
    });

    this.responseHeadersPolicy = new ResponseHeadersPolicy(
      this,
      'SecurityHeaders',
      {
        responseHeadersPolicyName: `${namePrefix}-app-security-headers`,
        comment: `Strict CSP for ${props.domainName} (no inline script, no GA)`,
        securityHeadersBehavior: props.securityHeadersBehavior,
      },
    );

    const bucketBehavior = (cachePolicy: ICachePolicy): BehaviorOptions => ({
      origin,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
      compress: true,
      cachePolicy,
      responseHeadersPolicy: this.responseHeadersPolicy,
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: `gagnechris ${config.name} ${props.domainName}`,
      domainNames: [props.domainName],
      certificate: props.certificate,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
      enableLogging: true,
      logBucket: props.accessLogs,
      logFilePrefix: `cloudfront-${appName}/`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        ...bucketBehavior(props.htmlCachePolicy),
        functionAssociations: [
          {
            function: props.viewerRequestFunction,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        '/assets/*': bucketBehavior(props.assetsCachePolicy),
        '/api/*': props.apiBehavior,
        ...props.additionalBehaviors?.(this.responseHeadersPolicy),
      },
      // No distribution-wide errorResponses: they would rewrite /api 4xx
      // into HTML. The viewer-request function does the SPA fallback.
    });

    // OAC alone returns 403 for missing keys; ListBucket yields proper 404s.
    this.bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowCloudFrontListBucket',
        actions: ['s3:ListBucket'],
        resources: [this.bucket.bucketArn],
        principals: [new ServicePrincipal('cloudfront.amazonaws.com')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': distributionArn(this.distribution),
          },
        },
      }),
    );

    NagSuppressions.addResourceSuppressions(this.distribution, [
      {
        id: 'AwsSolutions-CFR1',
        reason: 'Geo restriction is unnecessary for a single-owner app host.',
      },
      {
        id: 'AwsSolutions-CFR2',
        reason:
          'AWS WAF is deferred (cost); Shield Standard still applies at the edge.',
      },
      {
        id: 'AwsSolutions-CFR4',
        reason:
          'TLS 1.2+ is enforced via minimumProtocolVersion TLS_V1_2_2021.',
      },
    ]);

    // Create only: later deploys of the real app must not be overwritten.
    const placeholder = new AwsCustomResource(this, 'PlaceholderIndex', {
      installLatestAwsSdk: false,
      onCreate: {
        service: 'S3',
        action: 'putObject',
        parameters: {
          Bucket: this.bucket.bucketName,
          Key: 'index.html',
          ContentType: 'text/html; charset=utf-8',
          CacheControl: 'no-cache',
          Body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${props.domainName}</title></head><body></body></html>\n`,
        },
        physicalResourceId: PhysicalResourceId.of(
          `${namePrefix}-placeholder-index`,
        ),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['s3:PutObject'],
          resources: [this.bucket.arnForObjects('index.html')],
        }),
      ]),
    });
    NagSuppressions.addResourceSuppressions(
      placeholder,
      [
        {
          id: 'AwsSolutions-L1',
          reason:
            'AwsCustomResource manages the Lambda runtime; we accept the CDK provider default.',
        },
      ],
      true,
    );
    // Provider singleton lives at the stack root, outside this construct.
    const stack = Stack.of(this);
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `/${stack.stackName}/AWS${AwsCustomResource.PROVIDER_FUNCTION_UUID.replaceAll('-', '')}/ServiceRole/Resource`,
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

    const alarm = new Alarm(this, 'CloudFront5xxAlarm', {
      alarmName: `${namePrefix}-cloudfront-5xx`,
      alarmDescription: `${props.domainName} CloudFront 5xx error rate above 5% for 10 minutes`,
      metric: this.distribution.metric5xxErrorRate({
        period: Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 5,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new SnsAction(props.alertsTopic));
    alarm.addOkAction(new SnsAction(props.alertsTopic));

    new StringParameter(this, 'BucketParam', {
      parameterName: ssmParameterName(config.name, props.bucketParamKey),
      stringValue: this.bucket.bucketName,
      description: `${props.domainName} S3 bucket name (web deploy pipeline)`,
    });
    new StringParameter(this, 'DistributionIdParam', {
      parameterName: ssmParameterName(config.name, props.distributionParamKey),
      stringValue: this.distribution.distributionId,
      description: `${props.domainName} CloudFront distribution ID (web deploy pipeline)`,
    });
  }
}

export function distributionArn(distribution: Distribution): string {
  return `arn:aws:cloudfront::${Stack.of(distribution).account}:distribution/${distribution.distributionId}`;
}
