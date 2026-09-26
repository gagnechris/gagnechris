import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
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
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';

/** Apex zone for the site (registration nameservers must match this zone). */
export const APEX_DOMAIN = 'gagnechris.com';

/** GitHub Pages IPv4 anycast addresses (apex A until CloudFront cutover). */
const GITHUB_PAGES_IPV4 = [
  '185.199.108.153',
  '185.199.109.153',
  '185.199.110.153',
  '185.199.111.153',
];

/** GitHub Pages IPv6 anycast addresses (apex AAAA until CloudFront cutover). */
const GITHUB_PAGES_IPV6 = [
  '2606:50c0:8000::153',
  '2606:50c0:8001::153',
  '2606:50c0:8002::153',
  '2606:50c0:8003::153',
];

export interface DnsStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /**
   * Optional zone override for unit tests. Production uses
   * `HostedZone.fromLookup` so nameservers are never replaced.
   */
  readonly hostedZone?: IHostedZone;
}

/**
 * Looks up the existing Route 53 hosted zone and defines all non-system
 * records in code (GitHub Pages + iCloud mail until later cutovers).
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

    // Allow Amazon ACM to issue for this zone (and wildcards).
    new CaaAmazonRecord(this, 'CaaAmazon', {
      zone: this.hostedZone,
    });

    // Apex → GitHub Pages (CHR-25 will point these at CloudFront).
    new ARecord(this, 'ApexA', {
      zone: this.hostedZone,
      recordName: APEX_DOMAIN,
      ttl: Duration.minutes(5),
      target: RecordTarget.fromValues(...GITHUB_PAGES_IPV4),
      comment: 'GitHub Pages (pre-CloudFront cutover)',
    });

    new AaaaRecord(this, 'ApexAaaa', {
      zone: this.hostedZone,
      recordName: APEX_DOMAIN,
      ttl: Duration.minutes(5),
      target: RecordTarget.fromValues(...GITHUB_PAGES_IPV6),
      comment: 'GitHub Pages IPv6 (pre-CloudFront cutover)',
    });

    // www as A/AAAA (not CNAME). A www CNAME makes ACM CAA follow github.io,
    // which does not authorize Amazon — cert validation fails with CAA_ERROR.
    new ARecord(this, 'WwwA', {
      zone: this.hostedZone,
      recordName: `www.${APEX_DOMAIN}`,
      ttl: Duration.minutes(5),
      target: RecordTarget.fromValues(...GITHUB_PAGES_IPV4),
      comment: 'www GitHub Pages IPv4 (A not CNAME for ACM CAA)',
    });

    new AaaaRecord(this, 'WwwAaaa', {
      zone: this.hostedZone,
      recordName: `www.${APEX_DOMAIN}`,
      ttl: Duration.minutes(5),
      target: RecordTarget.fromValues(...GITHUB_PAGES_IPV6),
      comment: 'www GitHub Pages IPv6 (A not CNAME for ACM CAA)',
    });

    // iCloud custom email domain
    new TxtRecord(this, 'ApexTxt', {
      zone: this.hostedZone,
      recordName: APEX_DOMAIN,
      ttl: Duration.minutes(5),
      values: ['apple-domain=XTdbhpUGfqfareBq', 'v=spf1 include:icloud.com ~all'],
      comment: 'Apple domain verification + SPF',
    });

    new CnameRecord(this, 'IcloudDkim', {
      zone: this.hostedZone,
      recordName: `sig1._domainkey.${APEX_DOMAIN}`,
      ttl: Duration.minutes(5),
      domainName: 'sig1.dkim.gagnechris.com.at.icloudmailadmin.com',
      comment: 'iCloud DKIM',
    });

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
