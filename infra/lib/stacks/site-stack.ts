import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
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
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  S3OriginAccessControl,
  SecurityPolicyProtocol,
  Signing,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  AaaaRecord,
  ARecord,
  HostedZone,
  type IHostedZone,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
  StorageClass,
} from 'aws-cdk-lib/aws-s3';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { NagSuppressions } from 'cdk-nag';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import { APEX_DOMAIN } from './dns-stack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SiteStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /** ACM cert in us-east-1 covering apex, www, and staging. */
  readonly certificate: ICertificate;
  /** Guardrails alerts topic for 5xx alarms. */
  readonly alertsTopic: ITopic;
  /**
   * Optional zone override for unit tests. Production uses
   * `HostedZone.fromLookup`.
   */
  readonly hostedZone?: IHostedZone;
}

/**
 * Private S3 origin + CloudFront (OAC, security headers, SPA routing).
 * Apex/www DNS stay on GitHub Pages until cutover; staging points here now.
 */
export class SiteStack extends Stack {
  readonly siteBucket: Bucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);

    const { config, certificate, alertsTopic } = props;

    const hostedZone =
      props.hostedZone ??
      HostedZone.fromLookup(this, 'HostedZone', {
        domainName: APEX_DOMAIN,
      });

    const domainNames =
      config.name === 'prod'
        ? [APEX_DOMAIN, `www.${APEX_DOMAIN}`, `staging.${APEX_DOMAIN}`]
        : [config.domainName];

    const accessLogs = new Bucket(this, 'AccessLogs', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      // CloudFront legacy logging still requires ACLs on the target bucket.
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      removalPolicy: config.statefulRemovalPolicy,
      autoDeleteObjects: config.statefulRemovalPolicy === RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'ExpireAccessLogs',
          enabled: true,
          expiration: Duration.days(90),
          transitions: [
            {
              storageClass: StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
        },
      ],
    });

    NagSuppressions.addResourceSuppressions(accessLogs, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'This bucket receives CloudFront and site-bucket access logs; logging the log bucket would recurse.',
      },
    ]);

    this.siteBucket = new Bucket(this, 'SiteBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      serverAccessLogsBucket: accessLogs,
      serverAccessLogsPrefix: 's3-site/',
      removalPolicy: config.statefulRemovalPolicy,
      autoDeleteObjects: config.statefulRemovalPolicy === RemovalPolicy.DESTROY,
    });

    const oac = new S3OriginAccessControl(this, 'SiteOac', {
      description: `OAC for gagnechris ${config.name} static site`,
      signing: Signing.SIGV4_ALWAYS,
    });

    const origin = S3BucketOrigin.withOriginAccessControl(this.siteBucket, {
      originAccessControl: oac,
    });

    const securityHeaders = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `gagnechris-${config.name}-security-headers`,
      comment: 'HSTS, CSP (GA4 + Formspree), and browser hardening',
      securityHeadersBehavior: {
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
        xssProtection: { protection: true, modeBlock: true, override: true },
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https://www.google-analytics.com https://www.googletagmanager.com",
            "font-src 'self'",
            "connect-src 'self' https://formspree.io https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.googletagmanager.com",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self' https://formspree.io",
            'upgrade-insecure-requests',
          ].join('; '),
          override: true,
        },
      },
    });

    const viewerRequestFn = new CloudFrontFunction(this, 'ViewerRequestFn', {
      functionName: `gagnechris-${config.name}-viewer-request`,
      comment: 'www→apex redirect + SPA / Option B path rewrite',
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromFile({
        filePath: path.join(__dirname, '../cloudfront/viewer-request-function.js'),
      }),
    });

    // Long cache for Vite hashed assets under /assets/*
    const assetsCachePolicy = new CachePolicy(this, 'AssetsCachePolicy', {
      cachePolicyName: `gagnechris-${config.name}-assets`,
      comment: 'Immutable hashed assets',
      defaultTtl: Duration.days(365),
      maxTtl: Duration.days(365),
      minTtl: Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Short TTL for HTML / SPA shell
    const htmlCachePolicy = new CachePolicy(this, 'HtmlCachePolicy', {
      cachePolicyName: `gagnechris-${config.name}-html`,
      comment: 'Short cache for HTML and SPA routes',
      defaultTtl: Duration.minutes(5),
      maxTtl: Duration.minutes(60),
      minTtl: Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: `gagnechris ${config.name} static site`,
      domainNames,
      certificate,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
      enableLogging: true,
      logBucket: accessLogs,
      logFilePrefix: 'cloudfront/',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: htmlCachePolicy,
        originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          {
            function: viewerRequestFn,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        '/assets/*': {
          origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          cachePolicy: assetsCachePolicy,
          responseHeadersPolicy: securityHeaders,
        },
        // Reserved for Blog CMS (CHR later) — same origin, no cache until wired.
        '/api/*': {
          origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeaders,
        },
        '/media/*': {
          origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          responseHeadersPolicy: securityHeaders,
        },
      },
      // Missing pre-rendered path → SPA shell (client router).
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(1),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(1),
        },
      ],
    });

    NagSuppressions.addResourceSuppressions(this.distribution, [
      {
        id: 'AwsSolutions-CFR1',
        reason:
          'Geo restriction is unnecessary for a personal portfolio site.',
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

    // staging → CloudFront now (apex/www stay on GitHub Pages until CHR-25).
    const stagingName = `staging.${APEX_DOMAIN}`;
    new ARecord(this, 'StagingA', {
      zone: hostedZone,
      recordName: stagingName,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
      comment: 'staging → CloudFront (CHR-22)',
    });
    new AaaaRecord(this, 'StagingAaaa', {
      zone: hostedZone,
      recordName: stagingName,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
      comment: 'staging → CloudFront IPv6 (CHR-22)',
    });

    const error5xx = this.distribution.metric5xxErrorRate({
      period: Duration.minutes(5),
      statistic: 'Average',
    });

    const alarm = new Alarm(this, 'CloudFront5xxAlarm', {
      alarmName: `gagnechris-${config.name}-cloudfront-5xx`,
      alarmDescription: 'CloudFront 5xx error rate above 5% for 10 minutes',
      metric: error5xx,
      threshold: 5,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new SnsAction(alertsTopic));
    alarm.addOkAction(new SnsAction(alertsTopic));

    new CfnOutput(this, 'SiteBucketName', {
      value: this.siteBucket.bucketName,
      description: 'Private S3 bucket for static site objects',
    });

    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    new CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront default domain (*.cloudfront.net)',
    });

    new CfnOutput(this, 'StagingUrl', {
      value: `https://${stagingName}`,
      description: 'Custom domain for staging (DNS alias to this distribution)',
    });
  }
}
