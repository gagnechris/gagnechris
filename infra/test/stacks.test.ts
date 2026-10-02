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
  });

  it('SiteStack has /api/* and /media/* behaviors', () => {
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
    const template = Template.fromStack(site);
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
      AlarmName: 'gagnechris-prod-api-gateway-5xx',
      AlarmActions: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'gagnechris-prod-api-lambda-throttles',
    });
  });
});
