import { Aspects, App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import {
  APP_TABLE,
  PUBLISH_STREAM_SK,
  type TableIndexDefinition,
} from '@gagnechris/data';
import { applyStandardTags } from '../lib/aspects/standard-tags.js';
import { getEnvironment } from '../lib/config/environments.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { DataStack } from '../lib/stacks/data-stack.js';
import { EmailStack } from '../lib/stacks/email-stack.js';
import { PublisherStack } from '../lib/stacks/publisher-stack.js';
import { SiteStack } from '../lib/stacks/site-stack.js';
import { alertsTopicAlarmActions } from './helpers/alerts-topic.js';

const testEnv = {
  CDK_ACCOUNT: '123456789012',
  ALERTS_EMAIL: 'alerts@example.com',
};

function siteTemplate(): Template {
  const app = new App();
  const config = getEnvironment('prod', testEnv);
  const deps = new Stack(app, 'SiteAssertDeps', {
    env: { account: config.account, region: config.region },
  });
  const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
  const certificate = Certificate.fromCertificateArn(
    deps,
    'Cert',
    `arn:aws:acm:us-east-1:${config.account}:certificate/11111111-1111-1111-1111-111111111111`,
  );
  const site = new SiteStack(app, 'Site-prod', {
    env: { account: config.account, region: config.region },
    config,
    certificate,
    appHostsCertificate: certificate,
    alertsTopic,
  });
  applyStandardTags(site, config);
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
  return Template.fromStack(site);
}

describe('stack Template assertions', () => {
  it('DataStack matches APP_TABLE keys and GSIs', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'DataAssertDeps', {
      env: { account: config.account, region: config.region },
    });
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const data = new DataStack(app, 'Data-prod', {
      env: { account: config.account, region: config.region },
      config,
      alertsTopic,
    });
    const template = Template.fromStack(data);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'gagnechris-prod',
      KeySchema: [
        { AttributeName: APP_TABLE.partitionKey.name, KeyType: 'HASH' },
        { AttributeName: APP_TABLE.sortKey.name, KeyType: 'RANGE' },
      ],
      StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
      TimeToLiveSpecification: {
        AttributeName: 'ttl',
        Enabled: true,
      },
      GlobalSecondaryIndexes: APP_TABLE.globalSecondaryIndexes.map((gsi) =>
        Match.objectLike({
          IndexName: gsi.indexName,
          KeySchema: [
            { AttributeName: gsi.partitionKey.name, KeyType: 'HASH' },
            { AttributeName: gsi.sortKey.name, KeyType: 'RANGE' },
          ],
        }),
      ),
    });

    // No ChangeableForDays: compliance mode would become permanent.
    template.hasResourceProperties('AWS::Backup::BackupVault', {
      BackupVaultName: 'gagnechris-prod-app-table',
      LockConfiguration: {
        MinRetentionDays: 7,
        MaxRetentionDays: 35,
      },
    });
    template.hasResourceProperties('AWS::Backup::BackupPlan', {
      BackupPlan: Match.objectLike({
        BackupPlanName: 'gagnechris-prod-app-table-daily',
        BackupPlanRule: [
          Match.objectLike({
            RuleName: 'Daily',
            Lifecycle: { DeleteAfterDays: 7 },
          }),
        ],
      }),
    });
    template.hasResourceProperties('AWS::Events::Rule', {
      Name: 'gagnechris-prod-backup-job-failures',
      EventPattern: Match.objectLike({
        source: ['aws.backup'],
        detail: {
          // Restore events use `status` and copy events only carry vault
          // ARNs, so each event type needs its own branch to ever match.
          $or: [
            {
              state: ['FAILED', 'ABORTED', 'EXPIRED', 'PARTIAL'],
              backupVaultArn: [Match.anyValue()],
            },
            {
              state: ['FAILED', 'ABORTED', 'EXPIRED', 'PARTIAL'],
              sourceBackupVaultArn: [Match.anyValue()],
            },
            { status: ['FAILED', 'ABORTED', 'EXPIRED', 'PARTIAL'] },
          ],
        },
      }),
      Targets: [Match.objectLike({ Arn: Match.anyValue() })],
    });
    template.hasResourceProperties('AWS::Backup::BackupSelection', {
      BackupSelection: {
        SelectionName: 'AppTableSelection',
        Resources: Match.arrayWith([
          { 'Fn::GetAtt': [Match.stringLikeRegexp('AppTable'), 'Arn'] },
        ]),
        IamRoleArn: Match.anyValue(),
      },
    });
  });

  it('DataStack passes GSI projectionType and nonKeyAttributes through', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'ProjectionAssertDeps', {
      env: { account: config.account, region: config.region },
    });
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const gsi4: TableIndexDefinition = {
      indexName: 'gsi4',
      partitionKey: { name: 'gsi4pk', type: 'S' },
      sortKey: { name: 'gsi4sk', type: 'S' },
      projectionType: 'KEYS_ONLY',
    };
    const data = new DataStack(app, 'Data-prod', {
      env: { account: config.account, region: config.region },
      config,
      alertsTopic,
      tableDefinition: {
        ...APP_TABLE,
        globalSecondaryIndexes: [...APP_TABLE.globalSecondaryIndexes, gsi4],
      },
    });
    const indexes = Template.fromStack(data).findResources(
      'AWS::DynamoDB::Table',
    );
    const gsis = Object.values(indexes)[0]!.Properties
      .GlobalSecondaryIndexes as Array<{
      IndexName: string;
      Projection: { ProjectionType: string; NonKeyAttributes?: string[] };
    }>;
    const projectionOf = (name: string) =>
      gsis.find((g) => g.IndexName === name)?.Projection;
    expect(projectionOf('gsi4')).toEqual({ ProjectionType: 'KEYS_ONLY' });
    for (const gsi of APP_TABLE.globalSecondaryIndexes) {
      expect(projectionOf(gsi.indexName)).toEqual({
        ProjectionType: gsi.projectionType,
      });
    }

    const includeApp = new App();
    const includeDeps = new Stack(includeApp, 'IncludeAssertDeps', {
      env: { account: config.account, region: config.region },
    });
    const includeData = new DataStack(includeApp, 'Data-prod', {
      env: { account: config.account, region: config.region },
      config,
      alertsTopic: new Topic(includeDeps, 'Alerts', { enforceSSL: true }),
      tableDefinition: {
        ...APP_TABLE,
        globalSecondaryIndexes: [
          ...APP_TABLE.globalSecondaryIndexes,
          {
            ...gsi4,
            projectionType: 'INCLUDE',
            nonKeyAttributes: ['title', 'updatedAt'],
          },
        ],
      },
    });
    Template.fromStack(includeData).hasResourceProperties(
      'AWS::DynamoDB::Table',
      {
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'gsi4',
            Projection: {
              ProjectionType: 'INCLUDE',
              NonKeyAttributes: ['title', 'updatedAt'],
            },
          }),
        ]),
      },
    );
  });

  it('SiteStack has /api/* and /media/* behaviors', () => {
    const template = siteTemplate();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({ PathPattern: '/api/*' }),
        ]),
      }),
    });
    const siteJson = JSON.stringify(
      template.findResources('AWS::CloudFront::Distribution'),
    );
    expect(siteJson).toContain('"/media/*"');
    expect(siteJson).toContain('"/assets/*"');
    template.hasResourceProperties('AWS::CloudFront::KeyValueStore', {
      Name: 'gagnechris-prod-blog-slugs',
    });
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Id: 'ExpireNoncurrentVersions',
            Status: 'Enabled',
            NoncurrentVersionExpiration: Match.objectLike({
              NoncurrentDays: 90,
            }),
          }),
        ]),
      },
    });
  });

  it('SiteStack /api/* sends nosniff and default no-store', () => {
    const template = siteTemplate();
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        Name: 'gagnechris-prod-api-security-headers',
        SecurityHeadersConfig: Match.objectLike({
          ContentTypeOptions: { Override: true },
        }),
        CustomHeadersConfig: {
          Items: [
            { Header: 'Cache-Control', Value: 'no-store', Override: false },
          ],
        },
      }),
    });
    const policies = template.findResources(
      'AWS::CloudFront::ResponseHeadersPolicy',
    );
    const apiPolicyId = Object.entries(policies).find(
      ([, r]) =>
        r.Properties?.ResponseHeadersPolicyConfig?.Name ===
        'gagnechris-prod-api-security-headers',
    )?.[0];
    expect(apiPolicyId).toBeDefined();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/api/*',
            ResponseHeadersPolicyId: { Ref: apiPolicyId },
          }),
        ]),
      }),
    });
  });

  it('SiteStack public CSP allows GA and nothing for sign-in or uploads', () => {
    const template = siteTemplate();
    const policies = Object.values(
      template.findResources('AWS::CloudFront::ResponseHeadersPolicy'),
    );
    const site = policies.find(
      (p) =>
        p.Properties.ResponseHeadersPolicyConfig.Name ===
        'gagnechris-prod-security-headers',
    );
    expect(site).toBeDefined();
    const csp = JSON.stringify(
      site!.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig
        .ContentSecurityPolicy.ContentSecurityPolicy,
    );
    expect(csp).toContain('https://www.googletagmanager.com');
    expect(csp).toContain('https://www.google-analytics.com');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(
      site!.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig
        .XSSProtection,
    ).toEqual({ Override: true, Protection: false });
    expect(csp).not.toMatch(/auth\.gagnechris\.com|cognito-idp/);
    expect(csp).not.toMatch(/s3|SiteBucket|RegionalDomainName/i);
    expect(
      policies.map((p) => p.Properties.ResponseHeadersPolicyConfig.Name),
    ).not.toContain('gagnechris-prod-admin-security-headers');
  });

  it('PublisherStack stream filter uses PUBLISH_STREAM_SK and has DLQ + alarms', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'PubAssertDeps', {
      env: { account: config.account, region: config.region },
    });
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const data = new DataStack(app, 'DataForPubAssert', {
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

    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      FilterCriteria: {
        Filters: [
          {
            Pattern: Match.serializedJson(
              Match.objectLike({
                dynamodb: {
                  Keys: { sk: { S: [PUBLISH_STREAM_SK] } },
                },
              }),
            ),
          },
        ],
      },
      DestinationConfig: {
        OnFailure: { Destination: Match.anyValue() },
      },
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-stream-dlq-depth',
      MetricName: 'NumberOfMessagesSent',
      Statistic: 'Sum',
      Threshold: 1,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-lambda-errors',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-lambda-throttles',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-resume-pdf-errors',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-kvs-sync-failed',
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-rebuild-unsettled',
      Namespace: 'gagnechris',
      MetricName: 'RebuildUnsettled',
      Dimensions: Match.arrayWith([
        Match.objectLike({ Name: 'service', Value: 'gagnechris-publisher' }),
      ]),
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-publisher-data-integrity',
      Namespace: 'gagnechris',
      MetricName: 'DataIntegrityError',
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
    });
    const mappings = template.findResources('AWS::Lambda::EventSourceMapping');
    expect(JSON.stringify(mappings)).not.toContain('ReportBatchItemFailures');

    const statements = Object.values(
      template.findResources('AWS::IAM::Policy'),
    ).flatMap(
      (p) =>
        (p.Properties?.PolicyDocument?.Statement ?? []) as Array<{
          Sid?: string;
          Effect?: string;
          Action?: string | string[];
          Resource?: unknown;
          Condition?: Record<string, Record<string, unknown>>;
        }>,
    );
    const dynamoActions = statements.flatMap((s) =>
      (Array.isArray(s.Action) ? s.Action : [s.Action ?? '']).filter((a) =>
        a.startsWith('dynamodb:'),
      ),
    );
    expect(dynamoActions).toEqual(
      expect.arrayContaining([
        'dynamodb:GetItem',
        'dynamodb:BatchGetItem',
        'dynamodb:Query',
      ]),
    );
    for (const action of dynamoActions) {
      expect(action).not.toMatch(
        /^dynamodb:(Put|Update|Delete|BatchWrite|PartiQL|Scan|ConditionCheck|\*)/,
      );
    }
    const itemRead = statements.find(
      (s) => s.Sid === 'PublisherReadPublishedItems',
    );
    expect(itemRead?.Condition).toEqual({
      'ForAllValues:StringLike': {
        'dynamodb:LeadingKeys': [
          'POST#*',
          'HOME#*',
          'RESUME#*',
          'PROJECT#*',
          'SITE#publish',
        ],
      },
    });
    const indexQuery = statements.find(
      (s) => s.Sid === 'PublisherQueryPublishedIndex',
    );
    expect(indexQuery?.Condition).toEqual({
      'ForAllValues:StringLike': {
        'dynamodb:LeadingKeys': [
          'STATUS#published',
          'PROJECT_STATUS#published',
        ],
      },
    });
    expect(JSON.stringify(indexQuery?.Resource)).toContain('/index/gsi1');
    for (const s of statements) {
      const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
      if (
        actions.some((a) =>
          [
            'dynamodb:GetItem',
            'dynamodb:BatchGetItem',
            'dynamodb:Query',
          ].includes(a ?? ''),
        )
      ) {
        expect(JSON.stringify(s.Condition)).toContain('dynamodb:LeadingKeys');
      }
    }
  });

  it('ApiStack Lambda is arm64 Node 24 with powertools env and active tracing', () => {
    const app = new App();
    const config = getEnvironment('prod', testEnv);
    const deps = new Stack(app, 'ApiAssertDeps', {
      env: { account: config.account, region: config.region },
    });
    const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
    const certificate = Certificate.fromCertificateArn(
      deps,
      'Cert',
      `arn:aws:acm:us-east-1:${config.account}:certificate/11111111-1111-1111-1111-111111111111`,
    );
    const auth = new AuthStack(app, 'AuthForApiAssert', {
      env: { account: config.account, region: config.region },
      config,
      certificate,
      hostedZone: HostedZone.fromHostedZoneAttributes(app, 'ApiAssertZone', {
        hostedZoneId: 'ZXXXXXXXXXXXX',
        zoneName: 'gagnechris.com',
      }),
    });
    const data = new DataStack(app, 'DataForApiAssert', {
      env: { account: config.account, region: config.region },
      config,
      alertsTopic,
    });
    const zone = HostedZone.fromHostedZoneAttributes(deps, 'EmailZone', {
      hostedZoneId: 'ZXXXXXXXXXXXX',
      zoneName: 'gagnechris.com',
    });
    const email = new EmailStack(app, 'EmailForApiAssert', {
      env: { account: config.account, region: config.region },
      config,
      hostedZone: zone,
    });
    const api = new ApiStack(app, 'Api-prod', {
      env: { account: config.account, region: config.region },
      config,
      userPool: auth.userPool,
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
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
      TracingConfig: { Mode: 'Active' },
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
      AlarmName: 'gagnechris-prod-api-handler-errors',
      Namespace: 'gagnechris',
      MetricName: 'HandlerError',
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-data-integrity',
      Namespace: 'gagnechris',
      MetricName: 'DataIntegrityError',
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-sync-adapter-missing',
      Namespace: 'gagnechris',
      MetricName: 'SyncAdapterMissing',
      AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-sync-corrupt-row',
      Namespace: 'gagnechris',
      MetricName: 'SyncCorruptRow',
      AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-gateway-5xx',
      AlarmActions: alarmActions,
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-lambda-throttles',
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'gagnechris-prod-api-go',
      Runtime: 'provided.al2023',
      Architectures: ['arm64'],
      Environment: {
        Variables: Match.objectLike({
          POWERTOOLS_SERVICE_NAME: 'gagnechris-api',
          CONTACT_TO_EMAIL: config.alertsEmail,
        }),
      },
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-go-lambda-errors',
    });
    const integrationFunction = (routeKey: string) => {
      const [route] = Object.values(
        template.findResources('AWS::ApiGatewayV2::Route', {
          Properties: { RouteKey: routeKey },
        }),
      );
      const target = JSON.stringify(route?.Properties?.Target);
      const [integrationId] = Object.keys(
        template.findResources('AWS::ApiGatewayV2::Integration'),
      ).filter((id) => target.includes(id));
      const integration = template.toJSON().Resources[integrationId!];
      return JSON.stringify(integration.Properties.IntegrationUri);
    };
    for (const route of [
      'GET /api/health',
      'POST /api/contact',
      'POST /api/resume/download',
    ]) {
      expect(integrationFunction(route), route).toContain('GoApiFunction');
    }
    expect(integrationFunction('ANY /api/notebook/{proxy+}')).toContain(
      'ApiFunction',
    );
    expect(integrationFunction('ANY /api/notebook/{proxy+}')).not.toContain(
      'GoApiFunction',
    );
  });
});
