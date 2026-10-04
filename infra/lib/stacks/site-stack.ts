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
  type BehaviorOptions,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  KeyValueStore,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  S3OriginAccessControl,
  SecurityPolicyProtocol,
  Signing,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
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
import {
  ADMIN_HOST,
  NOTEBOOK_HOST,
  ssmParameterName,
} from '../config/constants.js';
import { AppHost, distributionArn } from '../constructs/app-host.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SiteStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly certificate: ICertificate;
  /** admin. + notebook. */
  readonly appHostsCertificate: ICertificate;
  readonly alertsTopic: ITopic;
}

export class SiteStack extends Stack {
  readonly siteBucket: Bucket;
  readonly distribution: Distribution;
  readonly adminHost: AppHost;
  readonly notebookHost: AppHost;
  readonly blogSlugsKeyValueStoreArn: string;

  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);

    const { config, certificate, appHostsCertificate, alertsTopic } = props;

    const domainNames = [config.domainName, `www.${config.domainName}`];

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
      lifecycleRules: [
        {
          id: 'ExpireNoncurrentVersions',
          enabled: true,
          noncurrentVersionExpiration: Duration.days(90),
        },
      ],
      // Browser PUTs for admin media uploads.
      cors: [
        {
          allowedMethods: [HttpMethods.PUT, HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: [`https://${ADMIN_HOST}`],
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

    const region = Stack.of(this).region;
    const cognitoOrigins = `https://auth.${config.domainName} https://cognito-idp.${region}.amazonaws.com`;
    // Presigned media PUTs go to this bucket's regional host only.
    const uploadOrigin = `https://${this.siteBucket.bucketRegionalDomainName}`;
    const sharedCsp = [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ];

    const securityHeadersBehavior = (contentSecurityPolicy: string[]) => ({
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
        contentSecurityPolicy: contentSecurityPolicy.join('; '),
        override: true,
      },
    });

    const securityHeaders = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `gagnechris-${config.name}-security-headers`,
      comment: 'HSTS, CSP (GA4), and browser hardening',
      securityHeadersBehavior: securityHeadersBehavior([
        ...sharedCsp,
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
        "img-src 'self' data: https://www.google-analytics.com https://www.googletagmanager.com",
        "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://www.googletagmanager.com",
      ]),
    });

    // The Lambda sets these itself; the edge covers responses API Gateway
    // generates (JWT authorizer 401/403, throttling 429). Cache-Control does
    // not override the origin.
    const apiSecurityHeaders = new ResponseHeadersPolicy(
      this,
      'ApiSecurityHeaders',
      {
        responseHeadersPolicyName: `gagnechris-${config.name}-api-security-headers`,
        comment: 'nosniff + HSTS on /api/*; no-store unless the API sets one',
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
            referrerPolicy: HeadersReferrerPolicy.NO_REFERRER,
            override: true,
          },
        },
        customHeadersBehavior: {
          customHeaders: [
            { header: 'Cache-Control', value: 'no-store', override: false },
          ],
        },
      },
    );

    const viewerRequestFunctionName = `gagnechris-${config.name}-viewer-request`;
    const blogSlugsKvs = new KeyValueStore(this, 'BlogSlugsKvs', {
      keyValueStoreName: `gagnechris-${config.name}-blog-slugs`,
      comment: 'Published /blog/<slug> allowlist for viewer-request (CHR-115)',
    });
    this.blogSlugsKeyValueStoreArn = blogSlugsKvs.keyValueStoreArn;

    const viewerRequestFn = new CloudFrontFunction(this, 'ViewerRequestFn', {
      functionName: viewerRequestFunctionName,
      comment:
        'www→apex, old /admin and /auth → app hosts, Option B, KVS blog slugs, 404 shell',
      runtime: FunctionRuntime.JS_2_0,
      keyValueStore: blogSlugsKvs,
      code: FunctionCode.fromFile({
        filePath: path.join(
          __dirname,
          '../cloudfront/viewer-request-function.js',
        ),
      }),
    });

    const viewerResponseFn = new CloudFrontFunction(this, 'ViewerResponseFn', {
      functionName: `gagnechris-${config.name}-viewer-response`,
      comment:
        'Force 404 status for /404.html; replace S3 XML errors with HTML 404 (CHR-102)',
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromFile({
        filePath: path.join(
          __dirname,
          '../cloudfront/viewer-response-function.js',
        ),
      }),
    });

    const assetsCachePolicy = new CachePolicy(this, 'AssetsCachePolicy', {
      cachePolicyName: `gagnechris-${config.name}-assets`,
      comment: 'Immutable hashed assets',
      defaultTtl: Duration.days(365),
      maxTtl: Duration.days(365),
      minTtl: Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // Media keys are unique per upload, so a long cache is safe.
    const mediaCachePolicy = new CachePolicy(this, 'MediaCachePolicy', {
      cachePolicyName: `gagnechris-${config.name}-media`,
      comment: 'Long cache for /media/* uploads',
      defaultTtl: Duration.days(365),
      maxTtl: Duration.days(365),
      minTtl: Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const htmlCachePolicy = new CachePolicy(this, 'HtmlCachePolicy', {
      cachePolicyName: `gagnechris-${config.name}-html`,
      comment: 'Short cache for HTML and SPA routes',
      defaultTtl: Duration.minutes(5),
      maxTtl: Duration.minutes(60),
      minTtl: Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // HTTP API id from SSM avoids Api→Site exports.
    const apiBehavior = (): BehaviorOptions => ({
      origin: new HttpOrigin(
        `${StringParameter.valueForStringParameter(
          this,
          ssmParameterName(config.name, 'httpApiId'),
        )}.execute-api.${Stack.of(this).region}.amazonaws.com`,
        {
          readTimeout: Duration.seconds(30),
        },
      ),
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: apiSecurityHeaders,
    });

    const siteBehavior = (
      responseHeadersPolicy: ResponseHeadersPolicy,
    ): BehaviorOptions => ({
      origin,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
      compress: true,
      cachePolicy: htmlCachePolicy,
      originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
      responseHeadersPolicy,
      functionAssociations: [
        {
          function: viewerRequestFn,
          eventType: FunctionEventType.VIEWER_REQUEST,
        },
        {
          function: viewerResponseFn,
          eventType: FunctionEventType.VIEWER_RESPONSE,
        },
      ],
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
      defaultBehavior: siteBehavior(securityHeaders),
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
        '/api/*': apiBehavior(),
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
      // /assets 403/404 into HTML. The viewer functions handle 404s instead.
    });

    const appViewerRequestFn = new CloudFrontFunction(
      this,
      'AppViewerRequestFn',
      {
        functionName: `gagnechris-${config.name}-app-viewer-request`,
        comment: 'SPA fallback for the admin and notebook hosts',
        runtime: FunctionRuntime.JS_2_0,
        code: FunctionCode.fromFile({
          filePath: path.join(__dirname, '../cloudfront/app-viewer-request.js'),
        }),
      },
    );

    const appCsp = (connectSrc: string[]) =>
      securityHeadersBehavior([
        ...sharedCsp,
        "script-src 'self'",
        "img-src 'self' data:",
        `connect-src ${["'self'", ...connectSrc].join(' ')}`,
      ]);

    const appHostCommon = {
      config,
      certificate: appHostsCertificate,
      accessLogs,
      alertsTopic,
      viewerRequestFunction: appViewerRequestFn,
      htmlCachePolicy,
      assetsCachePolicy,
    };

    // In this stack, not its own, because /media/* reads the site bucket and
    // the OAC SourceArn statement must live with that bucket's policy.
    this.adminHost = new AppHost(this, 'AdminHost', {
      ...appHostCommon,
      appName: 'admin',
      domainName: ADMIN_HOST,
      securityHeadersBehavior: appCsp([cognitoOrigins, uploadOrigin]),
      apiBehavior: apiBehavior(),
      additionalBehaviors: (responseHeadersPolicy) => ({
        '/media/*': {
          origin: S3BucketOrigin.withOriginAccessControl(this.siteBucket, {
            originAccessControl: oac,
          }),
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          cachePolicy: mediaCachePolicy,
          responseHeadersPolicy,
        },
      }),
      bucketParamKey: 'adminSiteBucketName',
      distributionParamKey: 'adminDistributionId',
    });

    this.notebookHost = new AppHost(this, 'NotebookHost', {
      ...appHostCommon,
      appName: 'notebook',
      domainName: NOTEBOOK_HOST,
      securityHeadersBehavior: appCsp([cognitoOrigins]),
      apiBehavior: apiBehavior(),
      bucketParamKey: 'notebookSiteBucketName',
      distributionParamKey: 'notebookDistributionId',
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
            'AWS:SourceArn': [
              distributionArn(this.distribution),
              distributionArn(this.adminHost.distribution),
            ],
          },
        },
      }),
    );

    NagSuppressions.addResourceSuppressions(this.distribution, [
      {
        id: 'AwsSolutions-CFR1',
        reason: 'Geo restriction is unnecessary for a personal portfolio site.',
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

    new StringParameter(this, 'SiteBucketParam', {
      parameterName: ssmParameterName(config.name, 'siteBucketName'),
      stringValue: this.siteBucket.bucketName,
      description: 'Static site S3 bucket name (web deploy pipeline)',
    });
    new StringParameter(this, 'DistributionIdParam', {
      parameterName: ssmParameterName(config.name, 'cloudfrontDistributionId'),
      stringValue: this.distribution.distributionId,
      description: 'CloudFront distribution ID (web deploy pipeline)',
    });
    new StringParameter(this, 'ViewerRequestFunctionNameParam', {
      parameterName: ssmParameterName(config.name, 'viewerRequestFunctionName'),
      stringValue: viewerRequestFunctionName,
      description: 'CloudFront viewer-request function (CDK-managed)',
    });
    new StringParameter(this, 'BlogSlugsKvsArnParam', {
      parameterName: ssmParameterName(config.name, 'blogSlugsKvsArn'),
      stringValue: this.blogSlugsKeyValueStoreArn,
      description: 'CloudFront KeyValueStore ARN for published blog slugs',
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
