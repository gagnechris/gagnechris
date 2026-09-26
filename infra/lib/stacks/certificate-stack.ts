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
 * ACM certificate in us-east-1 for CloudFront (apex, www, staging).
 * Looks up the Route 53 zone in this stack so DNS validation records are
 * created correctly (cross-stack fromLookup zones break validation).
 */
export class CertificateStack extends Stack {
  readonly certificate: ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
      domainName: APEX_DOMAIN,
    });

    this.certificate = new Certificate(this, 'SiteCertificate', {
      domainName: APEX_DOMAIN,
      subjectAlternativeNames: [
        `www.${APEX_DOMAIN}`,
        `staging.${APEX_DOMAIN}`,
      ],
      validation: CertificateValidation.fromDns(hostedZone),
    });

    new CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description:
        'ACM certificate ARN (us-east-1) for CloudFront — apex, www, staging.',
    });
  }
}
