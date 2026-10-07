import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { describe, expect, it } from 'vitest';
import { FUNCTION_CODE_BUDGET_BYTES } from '../lib/cloudfront/deployed-code.js';
import { functionSource } from '../lib/cloudfront/harness.js';
import { getEnvironment } from '../lib/config/environments.js';
import { SiteStack } from '../lib/stacks/site-stack.js';

function siteFunctions(): Record<string, string> {
  const app = new App();
  const config = getEnvironment('prod', {
    CDK_ACCOUNT: '123456789012',
    ALERTS_EMAIL: 'alerts@example.com',
  });
  const env = { account: config.account, region: config.region };
  const deps = new Stack(app, 'SizeDeps', { env });
  const certificate = Certificate.fromCertificateArn(
    deps,
    'Cert',
    `arn:aws:acm:us-east-1:${config.account}:certificate/11111111-1111-1111-1111-111111111111`,
  );
  const site = new SiteStack(app, 'Site-prod', {
    env,
    config,
    certificate,
    appHostsCertificate: certificate,
    alertsTopic: new Topic(deps, 'Alerts', { enforceSSL: true }),
  });
  const functions = Template.fromStack(site).findResources(
    'AWS::CloudFront::Function',
  );
  return Object.fromEntries(
    Object.values(functions).map((fn) => [
      fn.Properties.Name as string,
      fn.Properties.FunctionCode as string,
    ]),
  );
}

const functions = siteFunctions();

describe('CloudFront function code', () => {
  it.each(Object.entries(functions))(
    '%s fits the size budget, well under the 10,240-byte limit',
    (_name, code) => {
      expect(Buffer.byteLength(code, 'utf8')).toBeLessThanOrEqual(
        FUNCTION_CODE_BUDGET_BYTES,
      );
    },
  );

  it('is what the edge harness runs', () => {
    expect(Object.values(functions).sort()).toEqual(
      [
        'viewer-request-function.js',
        'viewer-response-function.js',
        'app-viewer-request.js',
      ]
        .map((name) => functionSource(name))
        .sort(),
    );
  });
});
