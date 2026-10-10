import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { App, Duration, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  GO_MODULE_ROOT,
  GoLambda,
  goVersion,
} from '../lib/constructs/go-lambda.js';
import { REPO_ROOT } from '../lib/constructs/node-lambda.js';

const FIXTURE_MODULE = join(REPO_ROOT, 'infra/test/fixtures/go-lambda');

let template: Template;
let assetDir: string;

beforeAll(() => {
  const app = new App({
    context: { 'aws:cdk:enable-asset-metadata': true },
  });
  const stack = new Stack(app, 'GoLambdaTest', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  const alertsTopic = new Topic(stack, 'Alerts');
  new GoLambda(stack, 'HelloFunction', {
    cmd: 'hello',
    moduleRoot: FIXTURE_MODULE,
    functionName: 'gagnechris-test-hello',
    memorySize: 128,
    timeout: Duration.seconds(10),
    powertoolsServiceName: 'gagnechris-hello',
    alertsTopic,
    alarmNamePrefix: 'gagnechris-test-hello',
    enableDurationAlarm: true,
    iam5NagReason: 'X-Ray tracing wildcard.',
    iam5NagAppliesTo: ['Resource::*'],
    environment: { EXTRA: 'yes' },
  });
  const assembly = app.synth();
  template = Template.fromStack(stack);
  const [fn] = Object.values(
    template.findResources('AWS::Lambda::Function'),
  ) as { Metadata: { 'aws:asset:path': string } }[];
  assetDir = join(assembly.directory, fn!.Metadata['aws:asset:path']);
}, 120_000);

describe('GoLambda', () => {
  it('runs a bootstrap binary on provided.al2023 arm64 with X-Ray', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gagnechris-test-hello',
      Runtime: 'provided.al2023',
      Architectures: ['arm64'],
      Handler: 'bootstrap',
      MemorySize: 128,
      Timeout: 10,
      TracingConfig: { Mode: 'Active' },
      LoggingConfig: {
        LogGroup: { Ref: Match.stringLikeRegexp('^HelloLogGroup') },
      },
      Environment: {
        Variables: {
          POWERTOOLS_SERVICE_NAME: 'gagnechris-hello',
          POWERTOOLS_METRICS_NAMESPACE: 'gagnechris',
          EXTRA: 'yes',
        },
      },
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 14,
    });
  });

  it('bundles a linux/arm64 ELF bootstrap binary', () => {
    const binary = readFileSync(join(assetDir, 'bootstrap'));
    expect(binary.subarray(0, 4)).toEqual(
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
    );
    // e_machine 0xB7 is AArch64.
    expect(binary.readUInt16LE(18)).toBe(0xb7);
  });

  it('alarms on errors, throttles and p99 duration to the alerts topic', () => {
    for (const [name, metric] of [
      ['gagnechris-test-hello-lambda-errors', 'Errors'],
      ['gagnechris-test-hello-lambda-throttles', 'Throttles'],
      ['gagnechris-test-hello-lambda-duration', 'Duration'],
    ] as const) {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: name,
        MetricName: metric,
        Namespace: 'AWS/Lambda',
        AlarmActions: [{ Ref: Match.stringLikeRegexp('^Alerts') }],
      });
    }
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-test-hello-lambda-duration',
      Threshold: 8000,
      ExtendedStatistic: 'p99',
    });
  });

  it('carries the cdk-nag suppressions for its role', () => {
    const roles = template.findResources('AWS::IAM::Role');
    const reasons = Object.values(roles).flatMap(
      (role) =>
        (
          role as {
            Metadata?: { cdk_nag?: { rules_to_suppress?: { id: string }[] } };
          }
        ).Metadata?.cdk_nag?.rules_to_suppress?.map((r) => r.id) ?? [],
    );
    expect(reasons).toEqual(
      expect.arrayContaining(['AwsSolutions-IAM4', 'AwsSolutions-IAM5']),
    );
  });
});

describe('Go toolchain pin', () => {
  it('builds the fixture with the same Go version as the go/ module', () => {
    expect(goVersion(FIXTURE_MODULE)).toBe(goVersion(GO_MODULE_ROOT));
  });
});
