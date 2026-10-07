import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
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
import { deployedFunctionCode } from '../cloudfront/deployed-code.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnvironmentConfig } from '../config/environments.js';
import {
  ADMIN_HOST,
  NOTEBOOK_HOST,
  ssmParameterName,
} from '../config/constants.js';
import { AppHost } from '../constructs/app-host.js';
import {
  bucketBehavior,
  csp,
  distribution5xxAlarm,
  mediaBehavior,
  PrivateSiteBucket,
  securityHeadersBehavior,
  suppressDistributionNags,
} from '../constructs/site-hosting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GA = 'https://www.google-analytics.com';
const GA_REGION1 = 'https://region1.google-analytics.com';
const GTM = 'https://www.googletagmanager.com';

export interface SiteStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly certificate: ICertificate;
  /** admin. + notebook. */
  readonly appHostsCertificate: ICertificate;
  readonly alertsTopic: ITopic;
}

export class SiteStack extends Stack {
  readonly siteBucket: PrivateSiteBucket;
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

    this.siteBucket = new PrivateSiteBucket(this, 'SiteBucket', {
      config,
      accessLogs,
      logPrefix: 's3-site/',
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
    const securityHeaders = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `gagnechris-${config.name}-security-headers`,
      comment: 'HSTS, CSP (GA4), and browser hardening',
      securityHeadersBehavior: securityHeadersBehavior(
        csp({
          script: [GTM, GA],
          img: [GA, GTM],
          connect: [GA, 'https://analytics.google.com', GA_REGION1, GTM],
        }),
      ),
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
        'www→apex, old /admin and /auth → app hosts, Option B, KVS post and project slugs, 404 shell',
      runtime: FunctionRuntime.JS_2_0,
      keyValueStore: blogSlugsKvs,
      code: FunctionCode.fromInline(
        deployedFunctionCode(
          path.join(__dirname, '../cloudfront/viewer-request-function.js'),
        ),
      ),
    });

    const viewerResponseFn = new CloudFrontFunction(this, 'ViewerResponseFn', {
      functionName: `gagnechris-${config.name}-viewer-response`,
      comment: 'Force 404 status for /404.html',
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromInline(
        deployedFunctionCode(
          path.join(__dirname, '../cloudfront/viewer-response-function.js'),
        ),
      ),
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

    // No viewer functions: these are files, not pages, so a missing one is
    // S3's 404 rather than the HTML 404 page.
    const hashedFileBehavior = bucketBehavior(
      origin,
      assetsCachePolicy,
      securityHeaders,
    );

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
        '/assets/*': hashedFileBehavior,
        '/api/*': apiBehavior(),
        '/media/*': mediaBehavior(origin, mediaCachePolicy, securityHeaders),
        '/fonts/*': hashedFileBehavior,
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
        code: FunctionCode.fromInline(
          deployedFunctionCode(
            path.join(__dirname, '../cloudfront/app-viewer-request.js'),
          ),
        ),
      },
    );

    const appCsp = (connect: string[], img: string[] = []) =>
      securityHeadersBehavior(csp({ connect, img }));

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
      // The Home and Resume previews load their images from the public site.
      securityHeadersBehavior: appCsp(
        [cognitoOrigins, uploadOrigin],
        [`https://${config.domainName}`],
      ),
      apiBehavior: apiBehavior(),
      additionalBehaviors: (responseHeadersPolicy) => ({
        '/media/*': mediaBehavior(
          origin,
          mediaCachePolicy,
          responseHeadersPolicy,
        ),
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

    this.siteBucket.allowCloudFrontListBucket([
      this.distribution,
      this.adminHost.distribution,
    ]);

    suppressDistributionNags(
      this.distribution,
      'Geo restriction is unnecessary for a personal portfolio site.',
    );

    distribution5xxAlarm(this, {
      distribution: this.distribution,
      alarmName: `gagnechris-${config.name}-cloudfront-5xx`,
      alarmDescription: 'CloudFront 5xx error rate above 5% for 10 minutes',
      alertsTopic,
    });

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
