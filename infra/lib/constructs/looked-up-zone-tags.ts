import { Stack } from 'aws-cdk-lib';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import type { IHostedZone } from 'aws-cdk-lib/aws-route53';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { standardTags } from '../aspects/standard-tags.js';
import type { EnvironmentConfig } from '../config/environments.js';
import type { AwsCustomResourceHandlerProps } from './custom-resource-handlers.js';

export interface LookedUpZoneTagsProps {
  readonly config: EnvironmentConfig;
  readonly zone: IHostedZone;
  readonly handler: AwsCustomResourceHandlerProps;
}

/**
 * Stack tags never reach a zone CDK only looks up, so its monthly charge
 * would count as unattributed spend.
 */
export class LookedUpZoneTags extends Construct {
  constructor(scope: Construct, id: string, props: LookedUpZoneTagsProps) {
    super(scope, id);

    const zoneId = props.zone.hostedZoneId;
    const call = {
      service: 'Route53',
      action: 'changeTagsForResource',
      parameters: {
        ResourceType: 'hostedzone',
        ResourceId: zoneId,
        AddTags: standardTags(props.config),
      },
      physicalResourceId: PhysicalResourceId.of(`ZoneTags-${zoneId}`),
    };
    const resource = new AwsCustomResource(this, 'Resource', {
      ...props.handler,
      installLatestAwsSdk: false,
      onCreate: call,
      onUpdate: call,
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['route53:ChangeTagsForResource'],
          resources: [
            `arn:${Stack.of(this).partition}:route53:::hostedzone/${zoneId}`,
          ],
        }),
      ]),
    });

    NagSuppressions.addResourceSuppressions(
      resource,
      [
        {
          id: 'AwsSolutions-L1',
          reason:
            'AwsCustomResource manages the Lambda runtime; we accept the CDK provider default.',
        },
      ],
      true,
    );
  }
}
