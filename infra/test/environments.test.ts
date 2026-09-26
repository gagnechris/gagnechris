import { Aspects, App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { applyStandardTags } from '../lib/aspects/standard-tags.js';
import {
  getEnvironment,
  parseEnvironmentName,
  resolveAccountId,
} from '../lib/config/environments.js';
import { DnsStack } from '../lib/stacks/dns-stack.js';

describe('environments', () => {
  it('parses staging and prod', () => {
    expect(parseEnvironmentName('staging')).toBe('staging');
    expect(parseEnvironmentName('prod')).toBe('prod');
    expect(parseEnvironmentName(undefined)).toBe('staging');
  });

  it('rejects unknown env names', () => {
    expect(() => parseEnvironmentName('dev')).toThrow(/Unknown env/);
  });

  it('resolves account from CDK_ACCOUNT without committing it', () => {
    expect(resolveAccountId({ CDK_ACCOUNT: '123456789012' })).toBe('123456789012');
    expect(() => resolveAccountId({})).toThrow(/account unresolved/i);
  });

  it('uses RETAIN for prod stateful resources and DESTROY for staging', () => {
    const env = { CDK_ACCOUNT: '123456789012' };
    expect(getEnvironment('prod', env).statefulRemovalPolicy).toBe(
      RemovalPolicy.RETAIN,
    );
    expect(getEnvironment('staging', env).statefulRemovalPolicy).toBe(
      RemovalPolicy.DESTROY,
    );
    expect(getEnvironment('prod', env).domainName).toBe('gagnechris.com');
    expect(getEnvironment('staging', env).domainName).toBe(
      'staging.gagnechris.com',
    );
  });
});

describe('standard tags and removal policy', () => {
  it('applies project, env, and managed-by tags', () => {
    const app = new App();
    const config = getEnvironment('staging', { CDK_ACCOUNT: '123456789012' });
    const stack = new DnsStack(app, 'Dns-staging', {
      env: { account: config.account, region: config.region },
    });
    applyStandardTags(stack, config);

    const bucket = new Bucket(stack, 'TagProbe', {
      removalPolicy: config.statefulRemovalPolicy,
      autoDeleteObjects: true,
    });
    NagSuppressions.addResourceSuppressions(
      bucket,
      [
        { id: 'AwsSolutions-S1', reason: 'Test probe bucket only; not deployed.' },
        { id: 'AwsSolutions-S10', reason: 'Test probe bucket only; not deployed.' },
      ],
      true,
    );
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(stack);
    const buckets = template.findResources('AWS::S3::Bucket');
    const tags = Object.values(buckets)[0]?.Properties?.Tags as
      | Array<{ Key: string; Value: string }>
      | undefined;
    expect(tags).toEqual(
      expect.arrayContaining([
        { Key: 'project', Value: 'gagnechris' },
        { Key: 'env', Value: 'staging' },
        { Key: 'managed-by', Value: 'cdk' },
      ]),
    );
  });

  it('retains prod stateful buckets', () => {
    const app = new App();
    const config = getEnvironment('prod', { CDK_ACCOUNT: '123456789012' });
    const stack = new Stack(app, 'Probe');
    applyStandardTags(stack, config);
    const bucket = new Bucket(stack, 'Data', {
      removalPolicy: config.statefulRemovalPolicy,
    });
    NagSuppressions.addResourceSuppressions(
      bucket,
      [
        { id: 'AwsSolutions-S1', reason: 'Test probe only.' },
        { id: 'AwsSolutions-S10', reason: 'Test probe only.' },
      ],
      true,
    );

    const template = Template.fromStack(stack);
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });
});
