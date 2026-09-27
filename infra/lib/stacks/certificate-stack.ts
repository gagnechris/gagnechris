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
 * Site and auth use separate certs so changing one hostname never replaces
 * the other (which would break cross-stack exports).
 * Zone lookup stays in this stack so DNS validation records create correctly.
 */
export class CertificateStack extends Stack {
  /** Apex + www for CloudFront. */
  readonly certificate: ICertificate;
  /** `auth.gagnechris.com` for Cognito managed login. */
  readonly authCertificate: ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: APEX_DOMAIN,
    });

    // Construct id SiteCertificateV2 kept after CHR-73 rotation (legacy
    // SiteCertificate with staging SAN was removed once Site cut over).
    this.certificate = new Certificate(this, 'SiteCertificateV2', {
      domainName: APEX_DOMAIN,
      subjectAlternativeNames: [`www.${APEX_DOMAIN}`],
      validation: CertificateValidation.fromDns(hostedZone),
    });

    this.authCertificate = new Certificate(this, 'AuthCertificate', {
      domainName: `auth.${APEX_DOMAIN}`,
      validation: CertificateValidation.fromDns(hostedZone),
    });

    new CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description:
        'ACM certificate ARN (us-east-1) for CloudFront - apex and www.',
    });

    new CfnOutput(this, 'AuthCertificateArn', {
      value: this.authCertificate.certificateArn,
      description:
        'ACM certificate ARN (us-east-1) for Cognito auth.gagnechris.com.',
    });
  }
}
