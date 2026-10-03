import { Aspects, App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { APP_TABLE, PUBLISH_STREAM_SK } from '@gagnechris/data';
import { applyStandardTags } from '../lib/aspects/standard-tags.js';
import { getEnvironment } from '../lib/config/environments.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { DataStack } from '../lib/stacks/data-stack.js';
import { EmailStack } from '../lib/stacks/email-stack.js';
import { PublisherStack } from '../lib/stacks/publisher-stack.js';
import { SiteStack } from '../lib/stacks/site-stack.js';

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
    alertsTopic,
  });
  applyStandardTags(site, config);
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
  return Template.fromStack(site);
}

describe('stack Template assertions (CHR-136)', () => {
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

    // CHR-175: AWS Backup plan selects the AppTable.
    // CHR-197: governance lock (no ChangeableForDays → never permanent).
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
              status: ['FAILED', 'ABORTED', 'EXPIRED', 'PARTIAL'],
              backupVaultArn: [Match.anyValue()],
            },
            {
              state: ['FAILED', 'ABORTED', 'EXPIRED', 'PARTIAL'],
              sourceBackupVaultArn: [Match.anyValue()],
            },
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
    // CHR-175: noncurrent version lifecycle on the versioned site bucket.
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

  it('SiteStack serves /admin and /auth with a strict CSP (CHR-193)', () => {
    const template = siteTemplate();
    const policies = template.findResources(
      'AWS::CloudFront::ResponseHeadersPolicy',
    );
    const cspFor = (name: string): string => {
      const policy = Object.values(policies).find(
        (p) => p.Properties.ResponseHeadersPolicyConfig.Name === name,
      );
      expect(policy, name).toBeDefined();
      return JSON.stringify(
        policy!.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig
          .ContentSecurityPolicy.ContentSecurityPolicy,
      );
    };

    const admin = cspFor('gagnechris-prod-admin-security-headers');
    expect(admin).toContain("script-src 'self';");
    expect(admin).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(admin).not.toMatch(/google/);
    expect(admin).not.toContain('*.s3');
    expect(admin).toContain("frame-ancestors 'none'");

    const site = cspFor('gagnechris-prod-security-headers');
    expect(site).toContain('https://www.googletagmanager.com');
    expect(site).not.toContain('*.s3');

    const distribution = JSON.stringify(
      template.findResources('AWS::CloudFront::Distribution'),
    );
    const adminPolicyId = Object.keys(policies).find(
      (id) =>
        policies[id]!.Properties.ResponseHeadersPolicyConfig.Name ===
        'gagnechris-prod-admin-security-headers',
    );
    for (const pattern of ['/admin*', '/auth*']) {
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          CacheBehaviors: Match.arrayWith([
            Match.objectLike({
              PathPattern: pattern,
              ResponseHeadersPolicyId: { Ref: adminPolicyId },
              FunctionAssociations: Match.arrayWith([
                Match.objectLike({ EventType: 'viewer-request' }),
              ]),
            }),
          ]),
        }),
      });
    }
    expect(distribution).toContain('"/admin*"');
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
      AlarmName: 'gagnechris-prod-publisher-data-integrity',
      Namespace: 'gagnechris',
      MetricName: 'DataIntegrityError',
      AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
    });
    const mappings = template.findResources('AWS::Lambda::EventSourceMapping');
    expect(JSON.stringify(mappings)).not.toContain('ReportBatchItemFailures');
  });

  it('ApiStack Lambda is arm64 Node 24 with powertools env', () => {
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
      webClient: auth.webClient,
      alertsTopic,
      dataTable: data.table,
      emailIdentity: email.emailIdentity,
      notifyEmailIdentity: email.notifyEmailIdentity,
      fromEmail: email.fromEmail,
    });
    applyStandardTags(api, config);
    Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
    const template = Template.fromStack(api);
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
      AlarmName: 'gagnechris-prod-api-handler-errors',
      Namespace: 'gagnechris',
      MetricName: 'HandlerError',
      AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-data-integrity',
      Namespace: 'gagnechris',
      MetricName: 'DataIntegrityError',
      AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-sync-adapter-missing',
      Namespace: 'gagnechris',
      MetricName: 'SyncAdapterMissing',
      AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-gateway-5xx',
      AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-lambda-throttles',
    });
  });
});
