import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import {
  Certificate,
  CertificateValidation,
} from 'aws-cdk-lib/aws-certificatemanager';
import {
  CachePolicy,
  Distribution,
  HeadersFrameOption,
  HttpVersion,
  PriceClass,
  ResponseHeadersPolicy,
  S3OriginAccessControl,
  SecurityPolicyProtocol,
  Signing,
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
} from 'aws-cdk-lib/aws-s3';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import {
  APEX_DOMAIN,
  COMPONENTS_HOST,
  ssmParameterName,
} from '../config/constants.js';
import {
  bucketBehavior,
  csp,
  distribution5xxAlarm,
  PrivateSiteBucket,
  securityHeadersBehavior,
  suppressDistributionNags,
} from '../constructs/site-hosting.js';

export interface ComponentsStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly alertsTopic: ITopic;
  /** Tests only. Prod looks the zone up so nameservers are never replaced. */
  readonly hostedZone?: IHostedZone;
}

/**
 * The Storybook catalog on its own host. Self-contained (certificate, DNS and
 * logs included) so it never touches the site's stacks or their exports.
 */
export class ComponentsStack extends Stack {
  readonly bucket: PrivateSiteBucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: ComponentsStackProps) {
    super(scope, id, props);

    const { config } = props;
    const namePrefix = `gagnechris-${config.name}-components`;

    const hostedZone =
      props.hostedZone ??
      HostedZone.fromLookup(this, 'HostedZone', { domainName: APEX_DOMAIN });

    const certificate = new Certificate(this, 'Certificate', {
      domainName: COMPONENTS_HOST,
      validation: CertificateValidation.fromDns(hostedZone),
    });

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
          expiration: Duration.days(30),
        },
      ],
    });
    NagSuppressions.addResourceSuppressions(accessLogs, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'This bucket receives the catalog access logs; logging the log bucket would recurse.',
      },
    ]);

    // Build output only, rebuilt from git on every deploy, so no AWS Backup.
    this.bucket = new PrivateSiteBucket(this, 'Bucket', {
      config,
      accessLogs,
      logPrefix: 's3-components/',
    });

    const origin = S3BucketOrigin.withOriginAccessControl(this.bucket, {
      originAccessControl: new S3OriginAccessControl(this, 'Oac', {
        description: `OAC for gagnechris ${config.name} ${COMPONENTS_HOST}`,
        signing: Signing.SIGV4_ALWAYS,
      }),
    });

    // Storybook's index.html and iframe.html carry inline scripts, and the
    // manager frames its own iframe.html, so this host allows both.
    const headers = securityHeadersBehavior(
      csp({ script: ["'unsafe-inline'"], frameAncestors: "'self'" }),
    );
    const responseHeadersPolicy = new ResponseHeadersPolicy(this, 'Headers', {
      responseHeadersPolicyName: `${namePrefix}-headers`,
      comment: `noindex and browser hardening for ${COMPONENTS_HOST}`,
      securityHeadersBehavior: {
        ...headers,
        frameOptions: {
          frameOption: HeadersFrameOption.SAMEORIGIN,
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'X-Robots-Tag',
            value: 'noindex, nofollow',
            override: true,
          },
        ],
      },
    });

    const htmlCachePolicy = new CachePolicy(this, 'HtmlCachePolicy', {
      cachePolicyName: `${namePrefix}-html`,
      comment: 'Short cache for the catalog pages and indexes',
      defaultTtl: Duration.minutes(5),
      maxTtl: Duration.minutes(60),
      minTtl: Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });
    const assetsCachePolicy = new CachePolicy(this, 'AssetsCachePolicy', {
      cachePolicyName: `${namePrefix}-assets`,
      comment: 'Immutable hashed assets',
      defaultTtl: Duration.days(365),
      maxTtl: Duration.days(365),
      minTtl: Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: `gagnechris ${config.name} ${COMPONENTS_HOST}`,
      domainNames: [COMPONENTS_HOST],
      certificate,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
      enableLogging: true,
      logBucket: accessLogs,
      logFilePrefix: 'cloudfront/',
      defaultRootObject: 'index.html',
      defaultBehavior: bucketBehavior(
        origin,
        htmlCachePolicy,
        responseHeadersPolicy,
      ),
      additionalBehaviors: {
        '/assets/*': bucketBehavior(
          origin,
          assetsCachePolicy,
          responseHeadersPolicy,
        ),
      },
    });

    this.bucket.allowCloudFrontListBucket([this.distribution]);
    suppressDistributionNags(
      this.distribution,
      'Geo restriction is unnecessary for a public component catalog.',
    );

    distribution5xxAlarm(this, {
      distribution: this.distribution,
      alarmName: `${namePrefix}-cloudfront-5xx`,
      alarmDescription: `${COMPONENTS_HOST} CloudFront 5xx error rate above 5% for 10 minutes`,
      alertsTopic: props.alertsTopic,
    });

    const target = RecordTarget.fromAlias(
      new CloudFrontTarget(this.distribution),
    );
    new ARecord(this, 'A', {
      zone: hostedZone,
      recordName: COMPONENTS_HOST,
      target,
      comment: `${COMPONENTS_HOST} → CloudFront`,
    });
    new AaaaRecord(this, 'Aaaa', {
      zone: hostedZone,
      recordName: COMPONENTS_HOST,
      target,
      comment: `${COMPONENTS_HOST} → CloudFront IPv6`,
    });

    new StringParameter(this, 'BucketParam', {
      parameterName: ssmParameterName(config.name, 'componentsBucketName'),
      stringValue: this.bucket.bucketName,
      description: `${COMPONENTS_HOST} S3 bucket name (components deploy)`,
    });
    new StringParameter(this, 'DistributionIdParam', {
      parameterName: ssmParameterName(config.name, 'componentsDistributionId'),
      stringValue: this.distribution.distributionId,
      description: `${COMPONENTS_HOST} CloudFront distribution ID (components deploy)`,
    });

    new CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront default domain for the component catalog',
    });
  }
}
