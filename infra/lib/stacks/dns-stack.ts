import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import {
  AaaaRecord,
  ARecord,
  CaaAmazonRecord,
  CnameRecord,
  HostedZone,
  type IHostedZone,
  RecordTarget,
  TxtRecord,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import type { Construct } from 'constructs';
import { APEX_DOMAIN } from '../config/constants.js';
import type { EnvironmentConfig } from '../config/environments.js';

/** @deprecated Import from `../config/constants.js` instead. */
export { APEX_DOMAIN } from '../config/constants.js';

export interface DnsStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /** CloudFront distribution for apex and www (CHR-25 cutover). */
  readonly distribution: IDistribution;
  /**
   * Optional zone override for unit tests. Production uses
   * `HostedZone.fromLookup` so nameservers are never replaced.
   */
  readonly hostedZone?: IHostedZone;
}

/**
 * Looks up the existing Route 53 hosted zone and defines all non-system
 * records in code (CloudFront site + iCloud mail).
 */
export class DnsStack extends Stack {
  readonly hostedZone: IHostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    this.hostedZone =
      props.hostedZone ??
      HostedZone.fromLookup(this, 'HostedZone', {
        domainName: APEX_DOMAIN,
      });

    const cfTarget = RecordTarget.fromAlias(
      new CloudFrontTarget(props.distribution),
    );

    // Allow Amazon ACM to issue for this zone (and wildcards).
    new CaaAmazonRecord(this, 'CaaAmazon', {
      zone: this.hostedZone,
    });

    // Apex → CloudFront.
    new ARecord(this, 'ApexA', {
      zone: this.hostedZone,
      recordName: APEX_DOMAIN,
      target: cfTarget,
      comment: 'Apex → CloudFront',
    });

    new AaaaRecord(this, 'ApexAaaa', {
      zone: this.hostedZone,
      recordName: APEX_DOMAIN,
      target: cfTarget,
      comment: 'Apex → CloudFront IPv6',
    });

    // www → CloudFront (viewer-request function 301s to apex).
    new ARecord(this, 'WwwA', {
      zone: this.hostedZone,
      recordName: `www.${APEX_DOMAIN}`,
      target: cfTarget,
      comment: 'www → CloudFront (redirects to apex)',
    });

    new AaaaRecord(this, 'WwwAaaa', {
      zone: this.hostedZone,
      recordName: `www.${APEX_DOMAIN}`,
      target: cfTarget,
      comment: 'www → CloudFront IPv6',
    });

    // iCloud custom email domain + SES outbound (CHR-38).
    new TxtRecord(this, 'ApexTxt', {
      zone: this.hostedZone,
      recordName: APEX_DOMAIN,
      ttl: Duration.minutes(5),
      values: [
        'apple-domain=XTdbhpUGfqfareBq',
        'v=spf1 include:icloud.com include:amazonses.com ~all',
      ],
      comment: 'Apple domain verification + SPF (iCloud + SES)',
    });

    new CnameRecord(this, 'IcloudDkim', {
      zone: this.hostedZone,
      recordName: `sig1._domainkey.${APEX_DOMAIN}`,
      ttl: Duration.minutes(5),
      domainName: 'sig1.dkim.gagnechris.com.at.icloudmailadmin.com',
      comment: 'iCloud DKIM',
    });

    // Soft DMARC until CHR-63 finalizes receiving / reporting.
    new TxtRecord(this, 'DmarcTxt', {
      zone: this.hostedZone,
      recordName: `_dmarc.${APEX_DOMAIN}`,
      ttl: Duration.minutes(5),
      values: ['v=DMARC1; p=none;'],
      comment: 'DMARC monitor mode (CHR-38 / CHR-63)',
    });

    // MX deferred (CHR-63): waiting on confirmation that iCloud Mail
    // for @gagnechris.com should be enabled.

    new CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: `Route 53 hosted zone for ${APEX_DOMAIN}`,
    });

    new CfnOutput(this, 'HostedZoneName', {
      value: APEX_DOMAIN,
      description: 'Apex domain name',
    });
  }
}
