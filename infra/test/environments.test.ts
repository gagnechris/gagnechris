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
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { CertificateStack } from '../lib/stacks/certificate-stack.js';
import { SiteStack } from '../lib/stacks/site-stack.js';
import { DnsStack } from '../lib/stacks/dns-stack.js';
import { DataStack } from '../lib/stacks/data-stack.js';
import { EmailStack } from '../lib/stacks/email-stack.js';
import { GuardrailsStack } from '../lib/stacks/guardrails-stack.js';
import {
  CDK_DEFAULT_BOOTSTRAP_QUALIFIER,
  CiDeployRoleStack,
} from '../lib/stacks/ci-deploy-role-stack.js';
import { PublisherStack } from '../lib/stacks/publisher-stack.js';
import { alertsTopicAlarmActions } from './helpers/alerts-topic.js';

const testEnv = {
  CDK_ACCOUNT: '123456789012',
  ALERTS_EMAIL: 'alerts@example.com',
};

describe('environments', () => {
  it('defaults to prod and rejects staging', () => {
    expect(ACTIVE_ENVIRONMENT).toBe('prod');
    expect(parseEnvironmentName(undefined)).toBe('prod');
    expect(parseEnvironmentName('prod')).toBe('prod');
    expect(() => parseEnvironmentName('staging')).toThrow(/Unknown env/);
  });

  it('rejects unknown env names', () => {
    expect(() => parseEnvironmentName('dev')).toThrow(/Unknown env/);
  });

  it('resolves account from CDK_ACCOUNT without committing it', () => {
    expect(resolveAccountId({ CDK_ACCOUNT: '123456789012' })).toBe(
      '123456789012',
    );
    expect(() => resolveAccountId({})).toThrow(/account unresolved/i);
  });

  it('resolves alerts email from env or context', () => {
    expect(resolveAlertsEmail(undefined, { ALERTS_EMAIL: 'a@b.co' })).toBe(
      'a@b.co',
    );
    expect(resolveAlertsEmail('c@d.co', {})).toBe('c@d.co');
    expect(() => resolveAlertsEmail(undefined, {})).toThrow(/Alerts email/);
  });

  it('pins region to us-east-1 and uses RETAIN for prod stateful resources', () => {
    const prod = getEnvironment('prod', {
      ...testEnv,
      CDK_DEFAULT_REGION: 'us-west-2',
    });
    expect(prod.statefulRemovalPolicy).toBe(RemovalPolicy.RETAIN);
    expect(prod.domainName).toBe('gagnechris.com');
    expect(prod.region).toBe('us-east-1');
    expect(prod.account).toBe('123456789012');
    expect(prod.alertsEmail).toBe('alerts@example.com');
  });
});

describe('standard tags and removal policy', () => {
  it('applies project, env, and managed-by tags', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const stack = new Stack(app, 'TagStack', {
      env: { account: config.account, region: config.region },
    });
    applyStandardTags(stack, config);

    const bucket = new Bucket(stack, 'TagProbe', {
      removalPolicy: config.statefulRemovalPolicy,
    });
    NagSuppressions.addResourceSuppressions(
      bucket,
      [
        {
          id: 'AwsSolutions-S1',
          reason: 'Test probe bucket only; not deployed.',
        },
        {
          id: 'AwsSolutions-S10',
          reason: 'Test probe bucket only; not deployed.',
        },
      ],
      true,
    );
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(stack);
    const buckets = template.findResources('AWS::S3::Bucket');
    const tags = Object.values(buckets)[0]?.Properties?.Tags as
      Array<{ Key: string; Value: string }> | undefined;
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

    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/alerts-topic-arn',
      Type: 'String',
    });
  });
});

describe('CiDeployRoleStack', () => {
  it('creates GitHub OIDC provider plus deploy, diff, and drift roles', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'CiDeps', {
      env: { account: config.account, region: config.region },
    });
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const stack = new CiDeployRoleStack(app, 'CiDeployRole-prod', {
      env: { account: config.account, region: config.region },
      config,
      alertsTopic,
    });
    applyStandardTags(stack, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(stack);

    template.resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 1);

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'gagnechris-prod-gha-deploy',
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'gagnechris-prod-gha-diff',
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'gagnechris-prod-gha-drift',
    });

    const roles = Object.values(template.findResources('AWS::IAM::Role'));
    const deploy = roles.find(
      (r) => r.Properties?.RoleName === 'gagnechris-prod-gha-deploy',
    );
    const diff = roles.find(
      (r) => r.Properties?.RoleName === 'gagnechris-prod-gha-diff',
    );
    const drift = roles.find(
      (r) => r.Properties?.RoleName === 'gagnechris-prod-gha-drift',
    );
    expect(JSON.stringify(deploy)).toContain('ref:refs/heads/main');
    expect(JSON.stringify(deploy)).toContain('environment:prod');
    expect(JSON.stringify(deploy)).toContain('AdministratorAccess');
    expect(JSON.stringify(diff)).toContain('pull_request');
    expect(JSON.stringify(diff)).toContain('ReadOnlyAccess');
    expect(JSON.stringify(drift)).toContain('environment:prod');
    expect(JSON.stringify(drift)).toContain('ReadOnlyAccess');
    expect(JSON.stringify(drift)).not.toContain('AdministratorAccess');

    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const diffPolicy = policies.find(
      (p) =>
        JSON.stringify(p).includes('CdkLookupAssumeRole') &&
        !JSON.stringify(p).includes('CloudFormationDetectDrift'),
    );
    expect(diffPolicy).toBeDefined();
    const policyJson = JSON.stringify(diffPolicy);
    expect(policyJson).toContain('cdk-*-lookup-role-*');
    expect(policyJson).toContain('sts:AssumeRole');
    // Must not allow AssumeRole on * (admin escalation via bootstrap deploy role).
    const statements = (diffPolicy?.Properties?.PolicyDocument?.Statement ??
      []) as Array<{
      Action?: string | string[];
      Resource?: string | string[];
    }>;
    const assumeStar = statements.some((s) => {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      const resources = Array.isArray(s.Resource) ? s.Resource : [s.Resource];
      return actions.includes('sts:AssumeRole') && resources.includes('*');
    });
    expect(assumeStar).toBe(false);

    const driftPolicy = policies.find((p) =>
      JSON.stringify(p).includes('CloudFormationDetectDrift'),
    );
    expect(driftPolicy).toBeDefined();
    expect(JSON.stringify(driftPolicy)).toContain(
      'cloudformation:DetectStackDrift',
    );
    expect(JSON.stringify(driftPolicy)).toContain('sns:Publish');

    const denyPolicies = policies.filter((p) =>
      JSON.stringify(p).includes('DenyPrivateDataReads'),
    );
    // Diff + drift + bootstrap lookup role (closes AssumeRole hop).
    expect(denyPolicies.length).toBeGreaterThanOrEqual(3);
    for (const p of denyPolicies) {
      const json = JSON.stringify(p);
      expect(json).toContain('dynamodb:GetItem');
      expect(json).toContain('dynamodb:PartiQLSelect');
      expect(json).toContain('s3:GetObject');
      expect(json).toContain('"Effect":"Deny"');
    }
    const lookupDeny = denyPolicies.find((p) =>
      JSON.stringify(p).includes(
        `cdk-${CDK_DEFAULT_BOOTSTRAP_QUALIFIER}-lookup-role-`,
      ),
    );
    expect(lookupDeny).toBeDefined();
    expect(JSON.stringify(lookupDeny)).toContain('dynamodb:PartiQLSelect');
  });
});

describe('DnsStack and CertificateStack', () => {
  it('defines apex/www CloudFront aliases, iCloud mail records, and ACM cert', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'DnsDeps', {
      env: { account: config.account, region: config.region },
    });
    const distribution = new Distribution(deps, 'Dist', {
      defaultBehavior: { origin: new HttpOrigin('example.com') },
    });
    const dns = new DnsStack(app, 'Dns-prod', {
      env: { account: config.account, region: config.region },
      config,
      distribution,
      hostedZone: HostedZone.fromHostedZoneAttributes(app, 'Zone', {
        hostedZoneId: 'ZXXXXXXXXXXXX',
        zoneName: 'gagnechris.com',
      }),
    });
    const certificate = new CertificateStack(app, 'Certificate-prod', {
      env: { account: config.account, region: 'us-east-1' },
      config,
    });
    applyStandardTags(dns, config);
    applyStandardTags(certificate, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const dnsTemplate = Template.fromStack(dns);
    dnsTemplate.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: 'gagnechris.com.',
      AliasTarget: Match.objectLike({
        DNSName: Match.anyValue(),
        HostedZoneId: Match.anyValue(),
      }),
    });
    dnsTemplate.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'AAAA',
      Name: 'gagnechris.com.',
      AliasTarget: Match.objectLike({
        DNSName: Match.anyValue(),
      }),
    });
    dnsTemplate.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: 'www.gagnechris.com.',
      AliasTarget: Match.objectLike({
        DNSName: Match.anyValue(),
      }),
    });
    dnsTemplate.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'CAA',
    });
    dnsTemplate.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'TXT',
      Name: 'gagnechris.com.',
    });
    dnsTemplate.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'CNAME',
      Name: 'sig1._domainkey.gagnechris.com.',
    });

    const certTemplate = Template.fromStack(certificate);
    certTemplate.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'gagnechris.com',
      SubjectAlternativeNames: ['www.gagnechris.com'],
      ValidationMethod: 'DNS',
    });
    certTemplate.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'auth.gagnechris.com',
      ValidationMethod: 'DNS',
    });
    certTemplate.resourceCountIs('AWS::CertificateManager::Certificate', 2);
    const siteCerts = Object.values(
      certTemplate.findResources('AWS::CertificateManager::Certificate'),
    ).filter((r) => r.Properties?.DomainName === 'gagnechris.com');
    expect(siteCerts).toHaveLength(1);
    expect(siteCerts[0]?.Properties?.SubjectAlternativeNames).toEqual([
      'www.gagnechris.com',
    ]);
  });
});

describe('AuthStack', () => {
  it('creates admin-only pool with passkeys, MFA, managed login, and clients', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'AuthDeps', {
      env: { account: config.account, region: config.region },
    });
    const certificate = Certificate.fromCertificateArn(
      deps,
      'Cert',
      `arn:aws:acm:us-east-1:${config.account}:certificate/11111111-1111-1111-1111-111111111111`,
    );
    const auth = new AuthStack(app, 'Auth-prod', {
      env: { account: config.account, region: config.region },
      config,
      certificate,
      hostedZone: HostedZone.fromHostedZoneAttributes(app, 'AuthZone', {
        hostedZoneId: 'ZXXXXXXXXXXXX',
        zoneName: 'gagnechris.com',
      }),
    });
    applyStandardTags(auth, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(auth);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'gagnechris-prod',
      AdminCreateUserConfig: Match.objectLike({
        AllowAdminCreateUserOnly: true,
      }),
      MfaConfiguration: 'OPTIONAL',
      UserPoolTier: 'ESSENTIALS',
      UsernameAttributes: ['email'],
      Policies: Match.objectLike({
        PasswordPolicy: Match.objectLike({
          MinimumLength: 12,
          RequireLowercase: true,
          RequireUppercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        }),
        SignInPolicy: Match.objectLike({
          AllowedFirstAuthFactors: Match.arrayWith(['PASSWORD', 'WEB_AUTHN']),
        }),
      }),
      DeletionProtection: 'ACTIVE',
    });

    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'web',
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      ExplicitAuthFlows: Match.arrayWith([
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_USER_AUTH',
      ]),
    });

    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'ios',
      GenerateSecret: false,
    });

    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'auth.gagnechris.com',
      ManagedLoginVersion: 2,
    });

    template.resourceCountIs('AWS::Cognito::ManagedLoginBranding', 3);

    // Prod clients never trust localhost; only the dev client does (CHR-195).
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'web',
      CallbackURLs: ['https://gagnechris.com/auth/callback'],
      LogoutURLs: ['https://gagnechris.com/'],
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'ios',
      CallbackURLs: [
        'https://gagnechris.com/auth/callback',
        'gagnechris://auth/callback',
      ],
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'dev-local',
      CallbackURLs: ['http://localhost:5173/auth/callback'],
      LogoutURLs: ['http://localhost:5173/'],
    });
    expect(JSON.stringify(template.toJSON())).not.toContain('localhost:3000');

    template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
      GroupName: 'admin',
    });
    template.hasResourceProperties(
      'AWS::Cognito::UserPoolUserToGroupAttachment',
      { GroupName: { Ref: 'AdminGroup' }, Username: config.adminUsername },
    );
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/cognito-dev-client-id',
    });

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: 'auth.gagnechris.com.',
    });

    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/cognito-user-pool-id',
    });
  });
});

describe('SiteStack', () => {
  it('creates private S3, CloudFront OAC, security headers, and path rewrite fn', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'Deps', {
      env: { account: config.account, region: config.region },
    });
    const certificate = Certificate.fromCertificateArn(
      deps,
      'Cert',
      `arn:aws:acm:us-east-1:${config.account}:certificate/11111111-1111-1111-1111-111111111111`,
    );
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const site = new SiteStack(app, 'Site-prod', {
      env: { account: config.account, region: config.region },
      config,
      certificate,
      alertsTopic,
    });
    applyStandardTags(site, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(site);
    const alarmActions = alertsTopicAlarmActions(alertsTopic);

    template.resourceCountIs('AWS::S3::Bucket', 2);
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });

    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.resourceCountIs('AWS::CloudFront::Function', 2);
    template.resourceCountIs('AWS::CloudFront::KeyValueStore', 1);
    template.resourceCountIs('AWS::CloudFront::ResponseHeadersPolicy', 2);

    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Aliases: ['gagnechris.com', 'www.gagnechris.com'],
        HttpVersion: 'http2and3',
        IPV6Enabled: Match.anyValue(),
        CustomErrorResponses: Match.absent(),
      },
    });

    // No staging DNS on the site stack.
    const records = template.findResources('AWS::Route53::RecordSet');
    expect(Object.keys(records)).toHaveLength(0);

    const bucketPolicies = Object.values(
      template.findResources('AWS::S3::BucketPolicy'),
    );
    expect(JSON.stringify(bucketPolicies)).toContain('s3:ListBucket');

    template.resourceCountIs('AWS::CloudWatch::Alarm', 1);
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-cloudfront-5xx',
      Threshold: 5,
      EvaluationPeriods: 2,
      DatapointsToAlarm: 2,
      AlarmActions: alarmActions,
    });
    // Viewer-request function is associated with the blog-slugs KeyValueStore (CHR-115 / CHR-180).
    const cfFunctions = template.findResources('AWS::CloudFront::Function');
    const viewerRequest = Object.values(cfFunctions).find((resource) => {
      const name = (resource.Properties as { Name?: string } | undefined)?.Name;
      return typeof name === 'string' && name.includes('viewer-request');
    });
    expect(viewerRequest).toBeDefined();
    const kvsAssociations = (
      viewerRequest?.Properties as {
        FunctionConfig?: { KeyValueStoreAssociations?: unknown[] };
      }
    )?.FunctionConfig?.KeyValueStoreAssociations;
    expect(kvsAssociations?.length).toBe(1);
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/site-bucket-name',
      Type: 'String',
    });
    // /api/* owned by Site (CHR-135), not Api→Site export.
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: '/api/*' }),
        ]),
      }),
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/cloudfront-distribution-id',
      Type: 'String',
    });
  });
});

describe('DataStack', () => {
  it('creates on-demand single-table with GSIs, PITR, stream, and RETAIN', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'DataDeps', {
      env: { account: config.account, region: config.region },
    });
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const data = new DataStack(app, 'Data-prod', {
      env: { account: config.account, region: config.region },
      config,
      alertsTopic,
    });
    applyStandardTags(data, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(data);
    const alarmActions = alertsTopicAlarmActions(alertsTopic);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'gagnechris-prod',
      BillingMode: 'PAY_PER_REQUEST',
      DeletionProtectionEnabled: true,
      StreamSpecification: {
        StreamViewType: 'NEW_AND_OLD_IMAGES',
      },
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
      TimeToLiveSpecification: {
        AttributeName: 'ttl',
        Enabled: true,
      },
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: 'gsi1' }),
        Match.objectLike({ IndexName: 'gsi2' }),
        Match.objectLike({ IndexName: 'gsi3' }),
      ]),
    });
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/data-table-name',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/data-table-stream-arn',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-dynamodb-system-errors',
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-dynamodb-throttled-requests',
      AlarmActions: alarmActions,
    });
  });
});

describe('ApiStack', () => {
  it('creates HTTP API with JWT on admin routes and health public', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'ApiDeps', {
      env: { account: config.account, region: config.region },
    });
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const certificate = Certificate.fromCertificateArn(
      deps,
      'Cert',
      `arn:aws:acm:us-east-1:${config.account}:certificate/11111111-1111-1111-1111-111111111111`,
    );
    const auth = new AuthStack(app, 'AuthForApi', {
      env: { account: config.account, region: config.region },
      config,
      certificate,
      hostedZone: HostedZone.fromHostedZoneAttributes(app, 'ApiAuthZone', {
        hostedZoneId: 'ZXXXXXXXXXXXX',
        zoneName: 'gagnechris.com',
      }),
    });
    const data = new DataStack(app, 'DataForApi', {
      env: { account: config.account, region: config.region },
      config,
      alertsTopic,
    });
    const zone = HostedZone.fromHostedZoneAttributes(deps, 'EmailZone', {
      hostedZoneId: 'ZXXXXXXXXXXXX',
      zoneName: 'gagnechris.com',
    });
    const email = new EmailStack(app, 'EmailForApi', {
      env: { account: config.account, region: config.region },
      config,
      hostedZone: zone,
    });
    const api = new ApiStack(app, 'Api-prod', {
      env: { account: config.account, region: config.region },
      config,
      userPool: auth.userPool,
      webClient: auth.webClient,
      iosClient: auth.iosClient,
      alertsTopic,
      dataTable: data.table,
      emailIdentity: email.emailIdentity,
      notifyEmailIdentity: email.notifyEmailIdentity,
      fromEmail: email.fromEmail,
    });
    applyStandardTags(api, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(api);
    const alarmActions = alertsTopicAlarmActions(alertsTopic);

    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'gagnechris-prod',
      ProtocolType: 'HTTP',
      CorsConfiguration: {
        AllowOrigins: ['https://gagnechris.com'],
        AllowHeaders: ['authorization', 'content-type', 'if-match'],
        AllowMethods: Match.arrayWith(['GET', 'OPTIONS']),
        ExposeHeaders: ['etag'],
        MaxAge: 86400,
      },
    });

    // Web + iOS only: the dev-local client's tokens are rejected (CHR-195).
    const authorizers = template.findResources('AWS::ApiGatewayV2::Authorizer');
    const audiences = Object.values(authorizers).map(
      (r) =>
        (r as { Properties: { JwtConfiguration: { Audience: unknown[] } } })
          .Properties.JwtConfiguration.Audience,
    );
    expect(audiences).toHaveLength(1);
    expect(audiences[0]).toHaveLength(2);
    expect(JSON.stringify(audiences[0])).not.toMatch(/DevClient/);
    // Access-log DestinationArn must be the log-group ARN without `:*` (CHR-159).
    // formatArn(COLON_RESOURCE_NAME) — not AttrArn, which always ends in `:*`.
    const stages = template.findResources('AWS::ApiGatewayV2::Stage');
    const stage = Object.values(stages)[0];
    const destArn = stage?.Properties?.AccessLogSettings?.DestinationArn;
    expect(destArn).toBeDefined();
    expect(JSON.stringify(destArn)).toContain('log-group');
    expect(JSON.stringify(destArn)).not.toContain(':*');
    expect(JSON.stringify(destArn)).not.toContain('"Arn"');
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
    });

    // JWT prefix contract on the synthesized template (CHR-171): catches
    // authorizer shorthand and unauthenticated routes under /api/admin|/notebook.
    const expectedJwtRouteKeys = new Set([
      'ANY /api/admin',
      'ANY /api/admin/{proxy+}',
      'ANY /api/notebook',
      'ANY /api/notebook/{proxy+}',
    ]);
    const expectedPublicRouteKeys = new Set([
      'GET /api/health',
      'POST /api/contact',
      'POST /api/resume/download',
    ]);
    const httpRoutes = template.findResources('AWS::ApiGatewayV2::Route');
    const jwtRouteKeys: string[] = [];
    const publicRouteKeys: string[] = [];
    for (const route of Object.values(httpRoutes)) {
      const routeKey = route.Properties?.RouteKey as string;
      const authType = route.Properties?.AuthorizationType as string;
      const path = routeKey.replace(/^(ANY|GET|POST|PUT|PATCH|DELETE)\s+/, '');
      if (authType === 'JWT') {
        jwtRouteKeys.push(routeKey);
        expect(
          expectedJwtRouteKeys.has(routeKey),
          `unexpected JWT route in template: ${routeKey}`,
        ).toBe(true);
      } else {
        publicRouteKeys.push(routeKey);
        expect(
          path === '/api/admin' ||
            path.startsWith('/api/admin/') ||
            path === '/api/notebook' ||
            path.startsWith('/api/notebook/'),
          `unauthenticated route under JWT prefix: ${routeKey}`,
        ).toBe(false);
      }
    }
    expect(jwtRouteKeys.sort()).toEqual([...expectedJwtRouteKeys].sort());
    expect(publicRouteKeys.sort()).toEqual([...expectedPublicRouteKeys].sort());

    // Notebook route throttle overrides (CHR-172).
    const stageResources = template.findResources('AWS::ApiGatewayV2::Stage');
    const stageProps = Object.values(stageResources)[0]?.Properties as {
      RouteSettings?: Record<string, { ThrottlingRateLimit?: number }>;
    };
    expect(
      stageProps?.RouteSettings?.['ANY /api/notebook/{proxy+}']
        ?.ThrottlingRateLimit,
    ).toBe(50);
    expect(
      stageProps?.RouteSettings?.['POST /api/contact']?.ThrottlingRateLimit,
    ).toBe(5);

    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Environment: {
        Variables: Match.objectLike({
          POWERTOOLS_SERVICE_NAME: 'gagnechris-api',
          POWERTOOLS_METRICS_NAMESPACE: 'gagnechris',
        }),
      },
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-lambda-errors',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-lambda-throttles',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-handler-errors',
      Namespace: 'gagnechris',
      MetricName: 'HandlerError',
      Dimensions: Match.arrayWith([
        Match.objectLike({ Name: 'service', Value: 'gagnechris-api' }),
      ]),
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-data-integrity',
      Namespace: 'gagnechris',
      MetricName: 'DataIntegrityError',
      Dimensions: Match.arrayWith([
        Match.objectLike({ Name: 'service', Value: 'gagnechris-api' }),
      ]),
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-gateway-5xx',
      Namespace: 'AWS/ApiGateway',
      MetricName: '5xx',
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/http-api-id',
    });

    // IAM scoping (CHR-180): DynamoDB + S3 media put are resource-scoped, not *.
    const apiPolicies = Object.values(
      template.findResources('AWS::IAM::Policy'),
    );
    const apiPolicyJson = JSON.stringify(apiPolicies);
    expect(apiPolicyJson).toContain('dynamodb:PutItem');
    expect(apiPolicyJson).toContain('s3:PutObject');
    expect(apiPolicyJson).toContain('/media/*');
    const starDynamo = apiPolicies.some((policy) => {
      const statements = (policy.Properties?.PolicyDocument?.Statement ??
        []) as Array<{
        Action?: string | string[];
        Resource?: string | string[];
        Effect?: string;
      }>;
      return statements.some((s) => {
        if (s.Effect === 'Deny') return false;
        const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
        const resources = Array.isArray(s.Resource) ? s.Resource : [s.Resource];
        return (
          actions.some(
            (a) => typeof a === 'string' && a.startsWith('dynamodb:'),
          ) && resources.includes('*')
        );
      });
    });
    expect(starDynamo).toBe(false);
  });
});

describe('PublisherStack', () => {
  it('wires stream source, S3/CF env via SSM, error alarm, and SSM name', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'PublisherDeps', {
      env: { account: config.account, region: config.region },
    });
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const data = new DataStack(app, 'DataForPublisher', {
      env: { account: config.account, region: config.region },
      config,
      alertsTopic,
    });
    const publisher = new PublisherStack(app, 'Publisher-prod', {
      env: { account: config.account, region: config.region },
      config,
      dataTable: data.table,
      alertsTopic,
    });
    applyStandardTags(publisher, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(publisher);
    const alarmActions = alertsTopicAlarmActions(alertsTopic);
    // Site bucket / distribution / KVS come from SSM, not Site exports (CHR-149).
    const rendered = JSON.stringify(template.toJSON());
    expect(rendered).not.toMatch(/ImportValue":"[^"]*Site/);
    expect(rendered).toContain('/gagnechris/prod/site-bucket-name');
    expect(rendered).toContain('/gagnechris/prod/cloudfront-distribution-id');
    expect(rendered).toContain('/gagnechris/prod/blog-slugs-kvs-arn');
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gagnechris-prod-publisher',
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      Timeout: 60,
      MemorySize: 512,
      Environment: {
        Variables: Match.objectLike({
          DATA_TABLE_NAME: Match.anyValue(),
          SITE_BUCKET_NAME: Match.anyValue(),
          CLOUDFRONT_DISTRIBUTION_ID: Match.anyValue(),
          BLOG_SLUGS_KVS_ARN: Match.anyValue(),
          SITE_APEX_DOMAIN: 'gagnechris.com',
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      StartingPosition: 'LATEST',
      BatchSize: 10,
      BisectBatchOnFunctionError: true,
      FilterCriteria: {
        Filters: Match.anyValue(),
      },
      DestinationConfig: {
        OnFailure: {
          Destination: Match.anyValue(),
        },
      },
    });
    template.resourceCountIs('AWS::SQS::Queue', 1);
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'gagnechris-prod-publisher-stream-failures',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-lambda-errors',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-lambda-throttles',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-stream-dlq-depth',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-resume-pdf-errors',
      Namespace: 'gagnechris',
      MetricName: 'ResumePdfError',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-kvs-sync-failed',
      Namespace: 'gagnechris',
      MetricName: 'KvsSyncFailed',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-data-integrity',
      Namespace: 'gagnechris',
      MetricName: 'DataIntegrityError',
      Dimensions: Match.arrayWith([
        Match.objectLike({ Name: 'service', Value: 'gagnechris-publisher' }),
      ]),
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/publisher-function-name',
    });

    // Prove the ESM OnFailure destination is the stream-failures queue (CHR-134).
    const esms = template.findResources('AWS::Lambda::EventSourceMapping');
    const queues = template.findResources('AWS::SQS::Queue');
    const esm = Object.values(esms)[0];
    const queueLogicalId = Object.keys(queues)[0];
    expect(queueLogicalId).toBeDefined();
    const onFailureDest = esm?.Properties?.DestinationConfig?.OnFailure
      ?.Destination as { 'Fn::GetAtt'?: string[] } | undefined;
    expect(onFailureDest?.['Fn::GetAtt']?.[0]).toBe(queueLogicalId);

    // IAM scoping (CHR-180): table/stream/S3/CF grants are present and scoped.
    // (CDK stream ListStreams may use Resource *; table CRUD must not.)
    const publisherPolicies = Object.values(
      template.findResources('AWS::IAM::Policy'),
    );
    const publisherPolicyJson = JSON.stringify(publisherPolicies);
    expect(publisherPolicyJson).toContain('dynamodb:GetRecords');
    expect(publisherPolicyJson).toContain('dynamodb:PutItem');
    expect(publisherPolicyJson).toContain('s3:PutObject');
    expect(publisherPolicyJson).toContain('cloudfront:CreateInvalidation');
    expect(publisherPolicyJson).toContain('CloudFrontInvalidate');
    expect(publisherPolicyJson).toContain('CloudFrontBlogSlugsKvs');
    const starTableCrud = publisherPolicies.some((policy) => {
      const statements = (policy.Properties?.PolicyDocument?.Statement ??
        []) as Array<{
        Action?: string | string[];
        Resource?: string | string[];
        Effect?: string;
      }>;
      return statements.some((s) => {
        if (s.Effect === 'Deny') return false;
        const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
        const resources = Array.isArray(s.Resource) ? s.Resource : [s.Resource];
        const hasTableCrud = actions.some(
          (a) =>
            a === 'dynamodb:PutItem' ||
            a === 'dynamodb:UpdateItem' ||
            a === 'dynamodb:DeleteItem' ||
            a === 'dynamodb:GetItem' ||
            a === 'dynamodb:Query',
        );
        return hasTableCrud && resources.includes('*');
      });
    });
    expect(starTableCrud).toBe(false);
  });
});
