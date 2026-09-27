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
import { PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  HttpMethods,
  ObjectOwnership,
  StorageClass,
} from 'aws-cdk-lib/aws-s3';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnvironmentConfig } from '../config/environments.js';
import { APEX_DOMAIN } from './dns-stack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SiteStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /** ACM cert in us-east-1 covering apex and www. */
  readonly certificate: ICertificate;
  /** Guardrails alerts topic for 5xx alarms. */
  readonly alertsTopic: ITopic;
}

/**
 * Private S3 origin + CloudFront (OAC, security headers, Option B path rewrite).
 */
export class SiteStack extends Stack {
  readonly siteBucket: Bucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);

    const { config, certificate, alertsTopic } = props;

    const domainNames = [APEX_DOMAIN, `www.${APEX_DOMAIN}`];

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
      // Browser PUTs for admin media uploads (CHR-31).
      cors: [
        {
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: [
            `https://${APEX_DOMAIN}`,
            'http://localhost:5173',
            'http://localhost:3000',
          ],
          allowedHeaders: ['Content-Type', 'Content-Length'],
          exposedHeaders: ['ETag'],
          maxAge: 3600,
        },
      ],
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
      comment: 'HSTS, CSP (GA4 + Formspree + Cognito), and browser hardening',
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
            // Cognito: managed-login token endpoint + IdP APIs (admin Amplify auth).
            `connect-src 'self' https://formspree.io https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.googletagmanager.com https://auth.${APEX_DOMAIN} https://cognito-idp.${Stack.of(this).region}.amazonaws.com https://*.s3.${Stack.of(this).region}.amazonaws.com https://*.s3.amazonaws.com`,
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
      comment: 'www→apex redirect + Option B path rewrite',
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

    // Long cache for uploaded media under /media/* (unique keys; CHR-31).
    const mediaCachePolicy = new CachePolicy(this, 'MediaCachePolicy', {
      cachePolicyName: `gagnechris-${config.name}-media`,
      comment: 'Long cache for /media/* uploads',
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
        // /api/* is attached by ApiStack (HTTP API origin).
        '/media/*': {
          origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          cachePolicy: mediaCachePolicy,
          responseHeadersPolicy: securityHeaders,
        },
      },
      // No distribution-wide errorResponses: they would rewrite /api and
      // /assets 403/404 into 200 HTML. /blog/* rewrites to Option B
      // {path}/index.html; other extensionless routes use the SPA shell.
    });

    // OAC alone returns 403 for missing keys; ListBucket yields proper 404s.
    this.siteBucket.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowCloudFrontListBucket',
        actions: ['s3:ListBucket'],
        resources: [this.siteBucket.bucketArn],
        principals: [new ServicePrincipal('cloudfront.amazonaws.com')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
          },
        },
      }),
    );

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

    // CI reads these for web deploy (no hard-coded bucket/distribution IDs).
    new StringParameter(this, 'SiteBucketParam', {
      parameterName: `/gagnechris/${config.name}/site-bucket-name`,
      stringValue: this.siteBucket.bucketName,
      description: 'Static site S3 bucket name (web deploy pipeline)',
    });
    new StringParameter(this, 'DistributionIdParam', {
      parameterName: `/gagnechris/${config.name}/cloudfront-distribution-id`,
      stringValue: this.distribution.distributionId,
      description: 'CloudFront distribution ID (web deploy pipeline)',
    });

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
  }
}
