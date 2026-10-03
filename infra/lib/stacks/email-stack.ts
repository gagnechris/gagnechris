import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { HostedZone, type IHostedZone } from 'aws-cdk-lib/aws-route53';
import { EmailIdentity, Identity } from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';
import type { EnvironmentConfig } from '../config/environments.js';
import { APEX_DOMAIN } from '../config/constants.js';

export interface EmailStackProps extends StackProps {
  readonly config: EnvironmentConfig;
  /**
   * Tests only. Prod looks the zone up so Email does not depend on Dns, which
   * would create a Site → Api → Email → Dns → Site cycle.
   */
  readonly hostedZone?: IHostedZone;
}

/** SPF lives in DnsStack. */
export class EmailStack extends Stack {
  readonly emailIdentity: EmailIdentity;
  readonly fromEmail: string;
  readonly notifyEmailIdentity: EmailIdentity;

  constructor(scope: Construct, id: string, props: EmailStackProps) {
    super(scope, id, props);

    const { config } = props;
    this.fromEmail = `noreply@${APEX_DOMAIN}`;

    const hostedZone =
      props.hostedZone ??
      HostedZone.fromLookup(this, 'HostedZone', {
        domainName: APEX_DOMAIN,
      });

    this.emailIdentity = new EmailIdentity(this, 'DomainIdentity', {
      identity: Identity.publicHostedZone(hostedZone),
      mailFromDomain: `bounce.${APEX_DOMAIN}`,
    });

    // Sandbox: allow sending to the alerts inbox before production access.
    this.notifyEmailIdentity = new EmailIdentity(this, 'NotifyEmailIdentity', {
      identity: Identity.email(config.alertsEmail),
    });

    new CfnOutput(this, 'SesFromEmail', {
      value: this.fromEmail,
      description: 'SES From address for contact / resume notifications',
    });
  }
}
