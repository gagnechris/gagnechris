import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { IHostedZone } from 'aws-cdk-lib/aws-route53';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import { APEX_DOMAIN } from './dns-stack.js';

export interface EmailStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  readonly hostedZone: IHostedZone;
}

/**
 * SES domain identity for transactional mail (contact form, resume pings).
 * DKIM CNAMEs are created on the hosted zone. SPF is updated in DnsStack.
 */
export class EmailStack extends Stack {
  readonly emailIdentity: EmailIdentity;
  /** Verified From address used by the API Lambda. */
  readonly fromEmail: string;

  constructor(scope: Construct, id: string, props: EmailStackProps) {
    super(scope, id, props);

    const { config, hostedZone } = props;
    this.fromEmail = `noreply@${APEX_DOMAIN}`;

    this.emailIdentity = new EmailIdentity(this, 'DomainIdentity', {
      identity: Identity.publicHostedZone(hostedZone),
      mailFromDomain: `bounce.${APEX_DOMAIN}`,
    });

    // Sandbox: allow sending to the alerts inbox before production access.
    new EmailIdentity(this, 'NotifyEmailIdentity', {
      identity: Identity.email(config.alertsEmail),
    });

    new CfnOutput(this, 'SesFromEmail', {
      value: this.fromEmail,
      description: 'SES From address for contact / resume notifications',
    });
  }
}
