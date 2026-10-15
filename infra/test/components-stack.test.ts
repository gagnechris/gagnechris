import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { App, Aspects, Stack } from 'aws-cdk-lib';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { getEnvironment } from '../lib/config/environments.js';
import { ComponentsStack } from '../lib/stacks/components-stack.js';

function build() {
  const app = new App();
  const config = getEnvironment('prod', {
    CDK_ACCOUNT: '123456789012',
    ALERTS_EMAIL: 'alerts@example.com',
  });
  const env = { account: config.account, region: config.region };
  const deps = new Stack(app, 'Deps', { env });
  const stack = new ComponentsStack(app, 'Components-prod', {
    env,
    config,
    alertsTopic: new Topic(deps, 'Alerts', { enforceSSL: true }),
    hostedZone: HostedZone.fromHostedZoneAttributes(deps, 'Zone', {
      hostedZoneId: 'ZXXXXXXXXXXXX',
      zoneName: 'gagnechris.com',
    }),
  });
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
  return { stack, template: Template.fromStack(stack) };
}

const { stack, template } = build();

describe('ComponentsStack', () => {
  it('serves components.gagnechris.com from a private bucket with its own certificate', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'components.gagnechris.com',
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['components.gagnechris.com'],
        DefaultRootObject: 'index.html',
      }),
    });
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: Match.objectLike({
        BlockPublicPolicy: true,
        RestrictPublicBuckets: true,
      }),
      VersioningConfiguration: { Status: 'Enabled' },
    });
    template.resourcePropertiesCountIs(
      'AWS::Route53::RecordSet',
      { Name: 'components.gagnechris.com.' },
      2,
    );
  });

  it('tells crawlers not to index any response', () => {
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        CustomHeadersConfig: {
          Items: [
            {
              Header: 'X-Robots-Tag',
              Value: 'noindex, nofollow',
              Override: true,
            },
          ],
        },
      }),
    });
  });

  it("lets Storybook's manager frame its own preview and nothing else", () => {
    const [policy] = Object.values(
      template.findResources('AWS::CloudFront::ResponseHeadersPolicy'),
    );
    const security = policy!.Properties.ResponseHeadersPolicyConfig
      .SecurityHeadersConfig as {
      FrameOptions: { FrameOption: string };
      ContentSecurityPolicy: { ContentSecurityPolicy: string };
    };
    expect(security.FrameOptions.FrameOption).toBe('SAMEORIGIN');
    const csp = security.ContentSecurityPolicy.ContentSecurityPolicy;
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("connect-src 'self'");
  });

  it('publishes the bucket and distribution names for the deploy script', () => {
    for (const name of [
      '/gagnechris/prod/components-bucket-name',
      '/gagnechris/prod/components-cloudfront-distribution-id',
    ]) {
      template.hasResourceProperties('AWS::SSM::Parameter', { Name: name });
    }
  });

  it('passes cdk-nag', () => {
    expect(
      Annotations.fromStack(stack).findError('*', Match.anyValue()),
    ).toEqual([]);
  });
});
