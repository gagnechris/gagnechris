import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  Fn,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import {
  Certificate,
  CertificateValidation,
} from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HttpVersion,
  PriceClass,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  AaaaRecord,
  ARecord,
  CaaAmazonRecord,
  HostedZone,
  type IHostedZone,
  PublicHostedZone,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { NagSuppressions } from 'cdk-nag';
import type { Construct } from 'constructs';
import { deployedFunctionCode } from '../cloudfront/deployed-code.js';
import { APEX_DOMAIN } from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';
import { suppressDistributionNags } from '../constructs/site-hosting.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Registered here with no zone of its own; this stack owns its zone. */
export const OWNED_ZONE_DOMAIN = 'christophergagne.com';
/** Registered here with a zone created outside CDK; looked up. */
export const LOOKED_UP_ZONE_DOMAIN = 'chrisgagne.net';
export const REDIRECT_DOMAINS = [OWNED_ZONE_DOMAIN, LOOKED_UP_ZONE_DOMAIN];

export interface RedirectsStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /** Tests only. Prod looks the zone up so nameservers are never replaced. */
  readonly lookedUpZone?: IHostedZone;
}

/** Other domains registered in the account, each a 301 to the apex. */
export class RedirectsStack extends Stack {
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: RedirectsStackProps) {
    super(scope, id, props);

    const { config } = props;

    const ownedZone = new PublicHostedZone(this, 'OwnedZone', {
      zoneName: OWNED_ZONE_DOMAIN,
      comment: `${OWNED_ZONE_DOMAIN} redirects to ${APEX_DOMAIN}`,
    });
    // Deleting the zone would leave the registrar pointing at nameservers
    // that no longer answer for the domain.
    ownedZone.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const lookedUpZone =
      props.lookedUpZone ??
      HostedZone.fromLookup(this, 'LookedUpZone', {
        domainName: LOOKED_UP_ZONE_DOMAIN,
      });

    // A new zone gets new nameservers, so the registrar is pointed at them
    // before the certificate needs DNS validation through the zone.
    const ownedZoneNameservers = new AwsCustomResource(
      this,
      'OwnedZoneRegistrarNameservers',
      {
        installLatestAwsSdk: false,
        onUpdate: {
          service: 'Route53Domains',
          action: 'updateDomainNameservers',
          region: 'us-east-1',
          parameters: {
            DomainName: OWNED_ZONE_DOMAIN,
            Nameservers: [0, 1, 2, 3].map((i) => ({
              Name: Fn.select(i, ownedZone.hostedZoneNameServers!),
            })),
          },
          physicalResourceId: PhysicalResourceId.of(
            `RegistrarNameservers-${OWNED_ZONE_DOMAIN}`,
          ),
        },
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['route53domains:UpdateDomainNameservers'],
            resources: ['*'],
          }),
        ]),
      },
    );
    NagSuppressions.addResourceSuppressions(
      ownedZoneNameservers,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Route 53 Domains actions do not support resource-level permissions.',
        },
        {
          id: 'AwsSolutions-L1',
          reason:
            'AwsCustomResource manages the Lambda runtime; we accept the CDK provider default.',
        },
      ],
      true,
    );
    // Provider singleton lives outside the AwsCustomResource construct tree.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${Stack.of(this).stackName}/AWS679f53fac002430cb0da5b7982bd2287/ServiceRole/Resource`,
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

    const zones: Array<[string, IHostedZone]> = [
      [OWNED_ZONE_DOMAIN, ownedZone],
      [LOOKED_UP_ZONE_DOMAIN, lookedUpZone],
    ];
    const hostnames = zones.flatMap(([domain]) => [domain, `www.${domain}`]);

    const certificate = new Certificate(this, 'Certificate', {
      domainName: OWNED_ZONE_DOMAIN,
      subjectAlternativeNames: hostnames.filter((h) => h !== OWNED_ZONE_DOMAIN),
      validation: CertificateValidation.fromDnsMultiZone(
        Object.fromEntries(
          zones.flatMap(([domain, zone]) => [
            [domain, zone],
            [`www.${domain}`, zone],
          ]),
        ),
      ),
    });
    certificate.node.addDependency(ownedZoneNameservers);

    const redirectFn = new CloudFrontFunction(this, 'RedirectFn', {
      functionName: `gagnechris-${config.name}-redirect-viewer-request`,
      comment: `301 every request to ${APEX_DOMAIN}`,
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromInline(
        deployedFunctionCode(
          path.join(__dirname, '../cloudfront/redirect-viewer-request.js'),
        ),
      ),
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: `gagnechris ${config.name} redirects to ${APEX_DOMAIN}`,
      domainNames: hostnames,
      certificate,
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        // The function answers every request, so the origin is never called.
        origin: new HttpOrigin(APEX_DOMAIN),
        viewerProtocolPolicy: ViewerProtocolPolicy.ALLOW_ALL,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        functionAssociations: [
          {
            function: redirectFn,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });
    suppressDistributionNags(
      this.distribution,
      'Geo restriction is unnecessary for a redirect.',
    );
    NagSuppressions.addResourceSuppressions(this.distribution, [
      {
        id: 'AwsSolutions-CFR3',
        reason:
          'Every response is the same 301 from a viewer-request function; access logs would record nothing useful.',
      },
    ]);

    const target = RecordTarget.fromAlias(
      new CloudFrontTarget(this.distribution),
    );
    for (const [domain, zone] of zones) {
      const id = domain.replace(/\W/g, '');
      new CaaAmazonRecord(this, `${id}Caa`, { zone });
      for (const [prefix, host] of [
        ['Apex', domain],
        ['Www', `www.${domain}`],
      ] as const) {
        new ARecord(this, `${id}${prefix}A`, {
          zone,
          recordName: host,
          target,
          comment: `${host} → redirect CloudFront`,
        });
        new AaaaRecord(this, `${id}${prefix}Aaaa`, {
          zone,
          recordName: host,
          target,
          comment: `${host} → redirect CloudFront IPv6`,
        });
      }
    }

    new CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront default domain for the redirect domains',
    });
  }
}
