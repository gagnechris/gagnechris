import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/** Static site (S3 + CloudFront). Filled in by later site tickets. */
export class SiteStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
