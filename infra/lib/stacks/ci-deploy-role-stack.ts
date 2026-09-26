import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/** GitHub Actions OIDC deploy role. Implemented in CHR-19. */
export class CiDeployRoleStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
