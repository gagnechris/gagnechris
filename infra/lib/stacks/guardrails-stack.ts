import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/** Budgets, CloudTrail, alerts. Implemented in CHR-20. */
export class GuardrailsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
  }
}
