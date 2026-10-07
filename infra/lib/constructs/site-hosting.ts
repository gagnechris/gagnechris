import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
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
  type Distribution,
  type ICachePolicy,
  type IOrigin,
  type IResponseHeadersPolicy,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  type ResponseSecurityHeadersBehavior,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  type CorsRule,
  type IBucket,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

export function distributionArn(distribution: Distribution): string {
  return `arn:aws:cloudfront::${Stack.of(distribution).account}:distribution/${distribution.distributionId}`;
}

export interface PrivateSiteBucketProps {
  readonly config: EnvironmentConfig;
  readonly accessLogs: IBucket;
  /** Server access log prefix in `accessLogs`. */
  readonly logPrefix: string;
  readonly cors?: CorsRule[];
}

/** A versioned, private bucket that only CloudFront (through OAC) reads. */
export class PrivateSiteBucket extends Bucket {
  constructor(scope: Construct, id: string, props: PrivateSiteBucketProps) {
    const { config } = props;
    super(scope, id, {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      serverAccessLogsBucket: props.accessLogs,
      serverAccessLogsPrefix: props.logPrefix,
      removalPolicy: config.statefulRemovalPolicy,
      autoDeleteObjects: config.statefulRemovalPolicy === RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'ExpireNoncurrentVersions',
          enabled: true,
          noncurrentVersionExpiration: Duration.days(90),
        },
      ],
      cors: props.cors,
    });
  }

  /** OAC alone returns 403 for missing keys; ListBucket yields proper 404s. */
  allowCloudFrontListBucket(distributions: Distribution[]): void {
    const arns = distributions.map(distributionArn);
    this.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowCloudFrontListBucket',
        actions: ['s3:ListBucket'],
        resources: [this.bucketArn],
        principals: [new ServicePrincipal('cloudfront.amazonaws.com')],
        conditions: {
          StringEquals: { 'AWS:SourceArn': arns.length === 1 ? arns[0] : arns },
        },
      }),
    );
  }
}

/** Alerts (and clears) when the distribution's 5xx rate stays above 5%. */
export function distribution5xxAlarm(
  scope: Construct,
  props: {
    readonly distribution: Distribution;
    readonly alarmName: string;
    readonly alarmDescription: string;
    readonly alertsTopic: ITopic;
  },
): Alarm {
  const alarm = new Alarm(scope, 'CloudFront5xxAlarm', {
    alarmName: props.alarmName,
    alarmDescription: props.alarmDescription,
    metric: props.distribution.metric5xxErrorRate({
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
  return alarm;
}

export function suppressDistributionNags(
  distribution: Distribution,
  noGeoRestrictionReason: string,
): void {
  NagSuppressions.addResourceSuppressions(distribution, [
    { id: 'AwsSolutions-CFR1', reason: noGeoRestrictionReason },
    {
      id: 'AwsSolutions-CFR2',
      reason:
        'AWS WAF is deferred (cost); Shield Standard still applies at the edge.',
    },
    {
      id: 'AwsSolutions-CFR4',
      reason: 'TLS 1.2+ is enforced via minimumProtocolVersion TLS_V1_2_2021.',
    },
  ]);
}

/** A GET-only path on a bucket origin with no viewer functions. */
export function bucketBehavior(
  origin: IOrigin,
  cachePolicy: ICachePolicy,
  responseHeadersPolicy: IResponseHeadersPolicy,
): BehaviorOptions {
  return {
    origin,
    viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
    compress: true,
    cachePolicy,
    responseHeadersPolicy,
  };
}

/** `/media/*` uploads, from the site bucket, on any host. */
export const mediaBehavior = bucketBehavior;

/**
 * The Content-Security-Policy for one host. Every host shares the base
 * policy; each list adds sources after `'self'` (and `data:` for images).
 */
export function csp(sources: {
  readonly script?: readonly string[];
  readonly img?: readonly string[];
  readonly connect?: readonly string[];
}): string {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
    `script-src ${["'self'", ...(sources.script ?? [])].join(' ')}`,
    `img-src ${["'self'", 'data:', ...(sources.img ?? [])].join(' ')}`,
    `connect-src ${["'self'", ...(sources.connect ?? [])].join(' ')}`,
  ].join('; ');
}

/** HSTS, nosniff, DENY framing, strict-origin referrers, no XSS filter, and `contentSecurityPolicy`. */
export function securityHeadersBehavior(
  contentSecurityPolicy: string,
): ResponseSecurityHeadersBehavior {
  return {
    strictTransportSecurity: {
      accessControlMaxAge: Duration.days(365),
      includeSubdomains: true,
      preload: true,
      override: true,
    },
    contentTypeOptions: { override: true },
    frameOptions: {
      frameOption: HeadersFrameOption.DENY,
      override: true,
    },
    referrerPolicy: {
      referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
      override: true,
    },
    // Sends `X-XSS-Protection: 0`: browsers dropped the filter it switched on.
    xssProtection: { protection: false, override: true },
    contentSecurityPolicy: { contentSecurityPolicy, override: true },
  };
}
