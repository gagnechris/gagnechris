import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/** Route 53 hosted-zone lookup and DNS records. Implemented in CHR-21. */
export class DnsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
