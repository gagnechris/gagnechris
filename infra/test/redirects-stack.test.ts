import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { Aspects, Stack } from 'aws-cdk-lib';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { FUNCTION_CODE_BUDGET_BYTES } from '../lib/cloudfront/deployed-code.js';
import { functionSource } from '../lib/cloudfront/harness.js';
import { getEnvironment } from '../lib/config/environments.js';
import { RedirectsStack } from '../lib/stacks/redirects-stack.js';
import { testApp } from './helpers/test-app.js';

type Handler = (event: {
  request: {
    uri: string;
    querystring?: Record<
      string,
      { value?: string; multiValue?: Array<{ value: string }> }
    >;
  };
}) => {
  statusCode: number;
  headers: Record<string, { value: string }>;
};

const handler = new Function(
  `${functionSource('redirect-viewer-request.js')}\nreturn handler;`,
)() as Handler;

function build() {
  const app = testApp();
  const config = getEnvironment('prod', {
    CDK_ACCOUNT: '123456789012',
    ALERTS_EMAIL: 'alerts@example.com',
  });
  const env = { account: config.account, region: config.region };
  const deps = new Stack(app, 'Deps', { env });
  const stack = new RedirectsStack(app, 'Redirects-prod', {
    env,
    config,
    lookedUpZone: HostedZone.fromHostedZoneAttributes(deps, 'Zone', {
      hostedZoneId: 'ZNETZONE',
      zoneName: 'chrisgagne.net',
    }),
  });
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
  return { stack, template: Template.fromStack(stack) };
}

const { stack, template } = build();

describe('redirect viewer-request function', () => {
  it('301s to the same path and query on the apex', () => {
    const response = handler({
      request: {
        uri: '/blog/a-post',
        querystring: {
          ref: { value: 'x' },
          tag: { multiValue: [{ value: 'a' }, { value: 'b' }] },
        },
      },
    });
    expect(response.statusCode).toBe(301);
    expect(response.headers.location!.value).toBe(
      'https://gagnechris.com/blog/a-post?ref=x&tag=a&tag=b',
    );
  });

  it('301s the root without a query to the apex root', () => {
    expect(handler({ request: { uri: '/' } }).headers.location!.value).toBe(
      'https://gagnechris.com/',
    );
  });

  it('fits the CloudFront Functions size budget', () => {
    expect(
      Buffer.byteLength(functionSource('redirect-viewer-request.js'), 'utf8'),
    ).toBeLessThanOrEqual(FUNCTION_CODE_BUDGET_BYTES);
  });
});

describe('RedirectsStack', () => {
  const hosts = [
    'christophergagne.com',
    'www.christophergagne.com',
    'chrisgagne.net',
    'www.chrisgagne.net',
  ];

  it('serves every redirect host from one distribution and certificate', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'christophergagne.com',
      SubjectAlternativeNames: hosts.slice(1),
    });
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: hosts,
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'allow-all',
          FunctionAssociations: [
            Match.objectLike({ EventType: 'viewer-request' }),
          ],
        }),
      }),
    });
    for (const host of hosts) {
      for (const Type of ['A', 'AAAA']) {
        template.resourcePropertiesCountIs(
          'AWS::Route53::RecordSet',
          { Name: `${host}.`, Type },
          1,
        );
      }
    }
  });

  it('owns the christophergagne.com zone and points the registrar at it', () => {
    template.hasResource('AWS::Route53::HostedZone', {
      Properties: { Name: 'christophergagne.com.' },
      DeletionPolicy: 'Retain',
    });
    const create = JSON.stringify(
      Object.values(template.findResources('Custom::AWS'))[0]!.Properties
        .Create,
    );
    expect(create).toContain('updateDomainNameservers');
    expect(create).toContain('christophergagne.com');
  });

  it('raises no unsuppressed cdk-nag errors', () => {
    const errors = Annotations.fromStack(stack).findError(
      '*',
      Match.stringLikeRegexp('AwsSolutions-.*'),
    );
    expect(errors).toEqual([]);
  });
});
