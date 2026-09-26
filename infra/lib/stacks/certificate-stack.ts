import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/**
 * ACM certificate for CloudFront. Always deployed in us-east-1.
 * Implemented in CHR-21.
 */
export class CertificateStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
