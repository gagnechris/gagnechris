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
import { CiDeployRoleStack } from '../lib/stacks/ci-deploy-role-stack.js';
import { PublisherStack } from '../lib/stacks/publisher-stack.js';

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

describe('CiDeployRoleStack', () => {
  it('creates GitHub OIDC provider plus deploy and diff roles', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const stack = new CiDeployRoleStack(app, 'CiDeployRole-prod', {
      env: { account: config.account, region: config.region },
      config,
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

    const roles = Object.values(template.findResources('AWS::IAM::Role'));
    const deploy = roles.find(
      (r) => r.Properties?.RoleName === 'gagnechris-prod-gha-deploy',
    );
    const diff = roles.find(
      (r) => r.Properties?.RoleName === 'gagnechris-prod-gha-diff',
    );
    expect(JSON.stringify(deploy)).toContain('ref:refs/heads/main');
    expect(JSON.stringify(deploy)).toContain('environment:prod');
    expect(JSON.stringify(deploy)).toContain('AdministratorAccess');
    expect(JSON.stringify(diff)).toContain('pull_request');
    expect(JSON.stringify(diff)).toContain('ReadOnlyAccess');

    const policies = Object.values(
      template.findResources('AWS::IAM::Policy'),
    );
    const diffPolicy = policies.find((p) =>
      JSON.stringify(p).includes('CdkLookupAssumeRole'),
    );
    expect(diffPolicy).toBeDefined();
    const policyJson = JSON.stringify(diffPolicy);
    expect(policyJson).toContain('cdk-*-lookup-role-*');
    expect(policyJson).toContain('sts:AssumeRole');
    // Must not allow AssumeRole on * (admin escalation via bootstrap deploy role).
    const statements = (
      diffPolicy?.Properties?.PolicyDocument?.Statement ?? []
    ) as Array<{ Action?: string | string[]; Resource?: string | string[] }>;
    const assumeStar = statements.some((s) => {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      const resources = Array.isArray(s.Resource) ? s.Resource : [s.Resource];
      return (
        actions.includes('sts:AssumeRole') && resources.includes('*')
      );
    });
    expect(assumeStar).toBe(false);
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

    template.resourceCountIs('AWS::Cognito::ManagedLoginBranding', 2);

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
    template.resourceCountIs('AWS::CloudFront::ResponseHeadersPolicy', 1);

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
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/site-bucket-name',
      Type: 'String',
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
    const data = new DataStack(app, 'Data-prod', {
      env: { account: config.account, region: config.region },
      config,
    });
    applyStandardTags(data, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(data);
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
    const site = new SiteStack(app, 'SiteForApi', {
      env: { account: config.account, region: config.region },
      config,
      certificate,
      alertsTopic,
    });
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
      distribution: site.distribution,
      alertsTopic,
      dataTable: data.table,
      emailIdentity: email.emailIdentity,
      notifyEmailIdentity: email.notifyEmailIdentity,
      fromEmail: email.fromEmail,
    });
    applyStandardTags(api, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(api);

    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'gagnechris-prod',
      ProtocolType: 'HTTP',
      CorsConfiguration: {
        AllowOrigins: [
          'https://gagnechris.com',
          'http://localhost:5173',
          'http://localhost:3000',
        ],
        AllowHeaders: ['Authorization', 'Content-Type'],
        AllowMethods: Match.arrayWith(['GET', 'OPTIONS']),
        MaxAge: 86400,
      },
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/http-api-id',
    });
  });
});

describe('PublisherStack', () => {
  it('wires stream source, S3/CF env, error alarm, and SSM name', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'PublisherDeps', {
      env: { account: config.account, region: config.region },
    });
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const certificate = Certificate.fromCertificateArn(
      deps,
      'Cert',
      `arn:aws:acm:us-east-1:${config.account}:certificate/11111111-1111-1111-1111-111111111111`,
    );
    const site = new SiteStack(app, 'SiteForPublisher', {
      env: { account: config.account, region: config.region },
      config,
      certificate,
      alertsTopic,
    });
    const data = new DataStack(app, 'DataForPublisher', {
      env: { account: config.account, region: config.region },
      config,
    });
    const publisher = new PublisherStack(app, 'Publisher-prod', {
      env: { account: config.account, region: config.region },
      config,
      dataTable: data.table,
      siteBucket: site.siteBucket,
      distribution: site.distribution,
      viewerRequestFunctionName: site.viewerRequestFunctionName,
      alertsTopic,
    });
    applyStandardTags(publisher, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

    const template = Template.fromStack(publisher);
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
          VIEWER_REQUEST_FUNCTION_NAME: 'gagnechris-prod-viewer-request',
          SITE_APEX_DOMAIN: 'gagnechris.com',
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      StartingPosition: 'LATEST',
      BatchSize: 10,
      BisectBatchOnFunctionError: true,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
      FilterCriteria: {
        Filters: Match.anyValue(),
      },
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-lambda-errors',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-resume-pdf-errors',
      Namespace: 'gagnechris',
      MetricName: 'ResumePdfError',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/gagnechris/prod/publisher-function-name',
    });
  });
});
