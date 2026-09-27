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
  /**
   * When true, omit the legacy site cert that still includes the staging SAN
   * (CHR-73 phase 2). Default false keeps it until Site has cut over to the
   * apex+www-only cert and a second deploy can delete the old one safely.
   */
  readonly dropLegacySiteCertificate?: boolean;
}

/**
 * ACM certificates in us-east-1 (CloudFront + Cognito custom domains).
 * Site and auth use separate certs so changing one hostname never replaces
 * the other (which would break cross-stack exports).
 * Zone lookup stays in this stack so DNS validation records create correctly.
 */
export class CertificateStack extends Stack {
  /** Apex + www for CloudFront (no staging SAN). */
  readonly certificate: ICertificate;
  /** `auth.gagnechris.com` for Cognito managed login. */
  readonly authCertificate: ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: APEX_DOMAIN,
    });

    // CHR-73 phase 1: new cert without staging. Keep the old construct (unless
    // dropLegacySiteCertificate) so CloudFormation does not delete an export
    // that Site-prod still imported in the previous deploy.
    this.certificate = new Certificate(this, 'SiteCertificateV2', {
      domainName: APEX_DOMAIN,
      subjectAlternativeNames: [`www.${APEX_DOMAIN}`],
      validation: CertificateValidation.fromDns(hostedZone),
    });

    if (!props.dropLegacySiteCertificate) {
      // Legacy: apex + www + staging. Unused after Site cuts over to V2.
      new Certificate(this, 'SiteCertificate', {
        domainName: APEX_DOMAIN,
        subjectAlternativeNames: [
          `www.${APEX_DOMAIN}`,
          `staging.${APEX_DOMAIN}`,
        ],
        validation: CertificateValidation.fromDns(hostedZone),
      });
    }

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
