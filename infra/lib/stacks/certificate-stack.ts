import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import {
  Certificate,
  CertificateValidation,
  type ICertificate,
} from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import { APEX_DOMAIN } from '../config/constants.js';

export interface CertificateStackProps extends StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * Separate site and auth certs so changing one hostname never replaces the
 * other, which would break cross-stack exports.
 */
export class CertificateStack extends Stack {
  readonly certificate: ICertificate;
  readonly authCertificate: ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: APEX_DOMAIN,
    });

    // Renaming the construct id would replace the certificate.
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
