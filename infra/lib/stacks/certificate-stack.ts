import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import {
  Certificate,
  CertificateValidation,
  type ICertificate,
} from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import { APEX_DOMAIN } from './dns-stack.js';

export interface CertificateStackProps extends StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * ACM certificates in us-east-1 (CloudFront + Cognito custom domains).
 * Site and auth use separate certs so adding the auth hostname never replaces
 * the site certificate (which would break the Site-prod cross-stack export).
 * Zone lookup stays in this stack so DNS validation records create correctly.
 */
export class CertificateStack extends Stack {
  /** Apex / www (staging SAN retained until a two-phase cert rotation). */
  readonly certificate: ICertificate;
  /** `auth.gagnechris.com` for Cognito managed login. */
  readonly authCertificate: ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: APEX_DOMAIN,
    });

    // staging SAN is unused (no CF alias / DNS) but kept for now: removing it
    // replaces this certificate and breaks the Site-prod cross-stack export.
    this.certificate = new Certificate(this, 'SiteCertificate', {
      domainName: APEX_DOMAIN,
      subjectAlternativeNames: [
        `www.${APEX_DOMAIN}`,
        `staging.${APEX_DOMAIN}`,
      ],
      validation: CertificateValidation.fromDns(hostedZone),
    });

    this.authCertificate = new Certificate(this, 'AuthCertificate', {
      domainName: `auth.${APEX_DOMAIN}`,
      validation: CertificateValidation.fromDns(hostedZone),
    });

    new CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description:
        'ACM certificate ARN (us-east-1) for CloudFront - apex, www (unused staging SAN retained).',
    });

    new CfnOutput(this, 'AuthCertificateArn', {
      value: this.authCertificate.certificateArn,
      description:
        'ACM certificate ARN (us-east-1) for Cognito auth.gagnechris.com.',
    });
  }
}
