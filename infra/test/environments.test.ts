import { Aspects, App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { applyStandardTags } from '../lib/aspects/standard-tags.js';
import {
  ACTIVE_ENVIRONMENT,
  getEnvironment,
  parseEnvironmentName,
  resolveAccountId,
  resolveAlertsEmail,
} from '../lib/config/environments.js';
import { DnsStack } from '../lib/stacks/dns-stack.js';
import { GuardrailsStack } from '../lib/stacks/guardrails-stack.js';

const testEnv = {
  CDK_ACCOUNT: '123456789012',
  ALERTS_EMAIL: 'alerts@example.com',
};

describe('environments', () => {
  it('defaults to prod and still accepts staging for later', () => {
    expect(ACTIVE_ENVIRONMENT).toBe('prod');
    expect(parseEnvironmentName(undefined)).toBe('prod');
    expect(parseEnvironmentName('prod')).toBe('prod');
    expect(parseEnvironmentName('staging')).toBe('staging');
  });

  it('rejects unknown env names', () => {
    expect(() => parseEnvironmentName('dev')).toThrow(/Unknown env/);
  });

  it('resolves account from CDK_ACCOUNT without committing it', () => {
    expect(resolveAccountId({ CDK_ACCOUNT: '123456789012' })).toBe('123456789012');
    expect(() => resolveAccountId({})).toThrow(/account unresolved/i);
  });

  it('resolves alerts email from env or context', () => {
    expect(resolveAlertsEmail(undefined, { ALERTS_EMAIL: 'a@b.co' })).toBe(
      'a@b.co',
    );
    expect(resolveAlertsEmail('c@d.co', {})).toBe('c@d.co');
    expect(() => resolveAlertsEmail(undefined, {})).toThrow(/Alerts email/);
  });

  it('uses RETAIN for prod and DESTROY for staging stateful resources', () => {
    expect(getEnvironment('prod', testEnv).statefulRemovalPolicy).toBe(
      RemovalPolicy.RETAIN,
    );
    expect(getEnvironment('staging', testEnv).statefulRemovalPolicy).toBe(
      RemovalPolicy.DESTROY,
    );
    expect(getEnvironment('prod', testEnv).domainName).toBe('gagnechris.com');
    expect(getEnvironment('staging', testEnv).domainName).toBe(
      'staging.gagnechris.com',
    );
    expect(getEnvironment('prod', testEnv).alertsEmail).toBe(
      'alerts@example.com',
    );
  });
});

describe('standard tags and removal policy', () => {
  it('applies project, env, and managed-by tags', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const stack = new DnsStack(app, 'Dns-prod', {
      env: { account: config.account, region: config.region },
    });
    applyStandardTags(stack, config);

    const bucket = new Bucket(stack, 'TagProbe', {
      removalPolicy: config.statefulRemovalPolicy,
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
        { Key: 'env', Value: 'prod' },
        { Key: 'managed-by', Value: 'cdk' },
      ]),
    );
  });

  it('retains prod stateful buckets', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
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

describe('GuardrailsStack', () => {
  it('defines budget, CloudTrail, SNS, account BPA, and Access Analyzer', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const stack = new GuardrailsStack(app, 'Guardrails-prod', {
      env: { account: config.account, region: config.region },
      config,
    });
    applyStandardTags(stack, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SNS::Topic', {
      DisplayName: 'gagnechris-prod-alerts',
    });
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alerts@example.com',
    });

    template.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetName: 'gagnechris-prod-monthly',
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
        BudgetLimit: { Amount: 20, Unit: 'USD' },
      },
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({
            NotificationType: 'ACTUAL',
            Threshold: 50,
          }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({
            NotificationType: 'FORECASTED',
            Threshold: 100,
          }),
        }),
      ]),
    });

    template.resourceCountIs('AWS::CloudTrail::Trail', 1);
    template.hasResourceProperties('AWS::CloudTrail::Trail', {
      IsMultiRegionTrail: true,
      EnableLogFileValidation: true,
      IncludeGlobalServiceEvents: true,
    });

    // Account BPA is applied via AwsCustomResource (S3 Control API).
    template.resourceCountIs('Custom::AWS', 1);

    template.hasResourceProperties('AWS::AccessAnalyzer::Analyzer', {
      Type: 'ACCOUNT',
    });

    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });
});
