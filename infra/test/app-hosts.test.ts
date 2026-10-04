import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Aspects, App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';
import { getEnvironment } from '../lib/config/environments.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { CertificateStack } from '../lib/stacks/certificate-stack.js';
import { DataStack } from '../lib/stacks/data-stack.js';
import { DnsStack } from '../lib/stacks/dns-stack.js';
import { EmailStack } from '../lib/stacks/email-stack.js';
import { SiteStack } from '../lib/stacks/site-stack.js';

const testEnv = {
  CDK_ACCOUNT: '123456789012',
  ALERTS_EMAIL: 'alerts@example.com',
  ADMIN_USERNAME: 'owner@example.com',
};

const __dirname = dirname(fileURLToPath(import.meta.url));

// Template JSON is untyped; tests index into it freely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type Resource = { Type: string; Properties: Record<string, Json> };

function build() {
  const app = new App();
  const config = getEnvironment('prod', testEnv);
  const env = { account: config.account, region: config.region };
  const deps = new Stack(app, 'Deps', { env });
  const alertsTopic = new Topic(deps, 'Alerts', { enforceSSL: true });
  const zone = HostedZone.fromHostedZoneAttributes(deps, 'Zone', {
    hostedZoneId: 'ZXXXXXXXXXXXX',
    zoneName: 'gagnechris.com',
  });
  const certArn = (id: string) =>
    Certificate.fromCertificateArn(
      deps,
      id,
      `arn:aws:acm:us-east-1:${config.account}:certificate/${id}`,
    );
  const certificateStack = new CertificateStack(app, 'Certificate-prod', {
    env,
    config,
  });
  const auth = new AuthStack(app, 'Auth-prod', {
    env,
    config,
    certificate: certArn('auth'),
    hostedZone: zone,
  });
  const data = new DataStack(app, 'Data-prod', { env, config, alertsTopic });
  const email = new EmailStack(app, 'Email-prod', {
    env,
    config,
    hostedZone: zone,
  });
  const api = new ApiStack(app, 'Api-prod', {
    env,
    config,
    userPool: auth.userPool,
    alertsTopic,
    dataTable: data.table,
    emailIdentity: email.emailIdentity,
    notifyEmailIdentity: email.notifyEmailIdentity,
    fromEmail: email.fromEmail,
  });
  const site = new SiteStack(app, 'Site-prod', {
    env,
    config,
    certificate: certArn('site'),
    appHostsCertificate: certArn('app-hosts'),
    alertsTopic,
  });
  const dns = new DnsStack(app, 'Dns-prod', {
    env,
    config,
    distribution: site.distribution,
    adminDistribution: site.adminHost.distribution,
    notebookDistribution: site.notebookHost.distribution,
    hostedZone: zone,
  });
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
  return {
    config,
    certificate: Template.fromStack(certificateStack),
    auth: Template.fromStack(auth),
    api: Template.fromStack(api),
    site: Template.fromStack(site),
    dns: Template.fromStack(dns),
  };
}

const built = build();

function resourcesOf(template: Template, type: string) {
  return template.findResources(type) as Record<string, Resource>;
}

function distributionFor(alias: string): Record<string, Json> {
  const match = Object.values(
    resourcesOf(built.site, 'AWS::CloudFront::Distribution'),
  ).find((d) => d.Properties.DistributionConfig.Aliases?.includes(alias));
  expect(match, alias).toBeDefined();
  return match!.Properties.DistributionConfig;
}

function policyIdByName(name: string): string {
  const id = Object.entries(
    resourcesOf(built.site, 'AWS::CloudFront::ResponseHeadersPolicy'),
  ).find(
    ([, p]) => p.Properties.ResponseHeadersPolicyConfig.Name === name,
  )?.[0];
  expect(id, name).toBeDefined();
  return id!;
}

function securityHeaders(name: string): Record<string, Json> {
  const policies = resourcesOf(
    built.site,
    'AWS::CloudFront::ResponseHeadersPolicy',
  );
  return policies[policyIdByName(name)]!.Properties.ResponseHeadersPolicyConfig
    .SecurityHeadersConfig;
}

function cspOf(name: string): string {
  return JSON.stringify(
    securityHeaders(name).ContentSecurityPolicy.ContentSecurityPolicy,
  );
}

function behavior(config: Record<string, Json>, pattern: string) {
  return (config.CacheBehaviors as Array<Record<string, Json>>).find(
    (b) => b.PathPattern === pattern,
  );
}

describe('app hosts: certificate', () => {
  it('adds a separate admin + notebook cert and leaves the site cert alone', () => {
    built.certificate.hasResourceProperties(
      'AWS::CertificateManager::Certificate',
      {
        DomainName: 'admin.gagnechris.com',
        SubjectAlternativeNames: ['notebook.gagnechris.com'],
        ValidationMethod: 'DNS',
      },
    );
    built.certificate.hasResourceProperties(
      'AWS::CertificateManager::Certificate',
      {
        DomainName: 'gagnechris.com',
        SubjectAlternativeNames: ['www.gagnechris.com'],
      },
    );
    const logicalIds = Object.keys(
      resourcesOf(built.certificate, 'AWS::CertificateManager::Certificate'),
    );
    expect(logicalIds.some((id) => id.startsWith('SiteCertificateV2'))).toBe(
      true,
    );
    expect(logicalIds.some((id) => id.startsWith('AppHostsCertificate'))).toBe(
      true,
    );
  });
});

describe('app hosts: DNS', () => {
  it('aliases admin and notebook (A + AAAA) to their own distributions', () => {
    const records = Object.values(
      resourcesOf(built.dns, 'AWS::Route53::RecordSet'),
    );
    for (const host of ['admin', 'notebook']) {
      for (const type of ['A', 'AAAA']) {
        const record = records.find(
          (r) =>
            r.Properties.Name === `${host}.gagnechris.com.` &&
            r.Properties.Type === type,
        );
        expect(record, `${host} ${type}`).toBeDefined();
        const target = JSON.stringify(record!.Properties.AliasTarget.DNSName);
        expect(target).toMatch(
          new RegExp(
            `${host === 'admin' ? 'AdminHost' : 'NotebookHost'}Distribution`,
          ),
        );
      }
    }
  });
});

describe('apex CloudFront: hashed fonts', () => {
  it('serves /fonts/* exactly like /assets/*, on the immutable assets cache policy', () => {
    const apex = distributionFor('gagnechris.com');
    const fonts = behavior(apex, '/fonts/*');
    const assets = behavior(apex, '/assets/*');
    expect(fonts).toBeDefined();
    expect(fonts).toEqual({ ...assets, PathPattern: '/fonts/*' });

    const [policyId, policy] = Object.entries(
      resourcesOf(built.site, 'AWS::CloudFront::CachePolicy'),
    ).find(
      ([, p]) =>
        p.Properties.CachePolicyConfig.Name === 'gagnechris-prod-assets',
    )!;
    expect(fonts!.CachePolicyId).toEqual({ Ref: policyId });
    expect(policy.Properties.CachePolicyConfig).toMatchObject({
      MinTTL: 31536000,
      DefaultTTL: 31536000,
      MaxTTL: 31536000,
    });
    expect(fonts!.TargetOriginId).toEqual(
      apex.DefaultCacheBehavior.TargetOriginId,
    );
    expect(fonts!.ResponseHeadersPolicyId).toEqual(
      apex.DefaultCacheBehavior.ResponseHeadersPolicyId,
    );
    expect(fonts!.FunctionAssociations).toBeUndefined();
  });
});

describe('app hosts: CloudFront', () => {
  it('serves each host from its own distribution on the app-hosts cert', () => {
    for (const host of ['admin.gagnechris.com', 'notebook.gagnechris.com']) {
      const config = distributionFor(host);
      expect(config.Aliases).toEqual([host]);
      expect(JSON.stringify(config.ViewerCertificate)).toContain('app-hosts');
      expect(config.ViewerCertificate.MinimumProtocolVersion).toBe(
        'TLSv1.2_2021',
      );
      expect(config.DefaultRootObject).toBe('index.html');
      expect(config.CustomErrorResponses).toBeUndefined();
    }
  });

  it('serves no /admin* or /auth* behaviour and no strict policy on the apex', () => {
    const apex = distributionFor('gagnechris.com');
    expect(apex.Aliases).toEqual(['gagnechris.com', 'www.gagnechris.com']);
    const patterns = (apex.CacheBehaviors as Json[]).map((b) => b.PathPattern);
    expect(patterns).not.toContain('/admin*');
    expect(patterns).not.toContain('/auth*');
    expect(patterns.filter((p: string) => /admin|auth/i.test(p))).toEqual([]);
    const names = Object.values(
      resourcesOf(built.site, 'AWS::CloudFront::ResponseHeadersPolicy'),
    ).map((p) => p.Properties.ResponseHeadersPolicyConfig.Name);
    expect(names).not.toContain('gagnechris-prod-admin-security-headers');
    expect(JSON.stringify(apex.ViewerCertificate)).toContain('site');
  });

  it('sends a strict, GA-free CSP on every bucket behaviour of each host', () => {
    for (const [host, name] of [
      ['admin.gagnechris.com', 'gagnechris-prod-admin-app-security-headers'],
      [
        'notebook.gagnechris.com',
        'gagnechris-prod-notebook-app-security-headers',
      ],
    ] as const) {
      const csp = cspOf(name);
      expect(csp).toContain("script-src 'self';");
      expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(csp).not.toMatch(/google/);
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("img-src 'self' data:;");
      expect(csp).toContain(
        "connect-src 'self' https://auth.gagnechris.com https://cognito-idp.us-east-1.amazonaws.com",
      );

      const headers = securityHeaders(name);
      expect(headers.StrictTransportSecurity).toMatchObject({
        AccessControlMaxAgeSec: 31536000,
        IncludeSubdomains: true,
        Preload: true,
      });
      expect(headers.FrameOptions.FrameOption).toBe('DENY');
      expect(headers.ContentTypeOptions.Override).toBe(true);
      expect(headers.ReferrerPolicy.ReferrerPolicy).toBe(
        'strict-origin-when-cross-origin',
      );

      const config = distributionFor(host);
      const policyRef = { Ref: policyIdByName(name) };
      expect(config.DefaultCacheBehavior.ResponseHeadersPolicyId).toEqual(
        policyRef,
      );
      expect(behavior(config, '/assets/*')?.ResponseHeadersPolicyId).toEqual(
        policyRef,
      );
    }
    // Presigned media PUTs go to the site bucket from admin only.
    expect(cspOf('gagnechris-prod-admin-app-security-headers')).toContain(
      'SiteBucket',
    );
    expect(cspOf('gagnechris-prod-notebook-app-security-headers')).not.toMatch(
      /SiteBucket|s3/,
    );
  });

  it('routes /api/* same-origin to the HTTP API with the API headers policy', () => {
    const apiPolicy = {
      Ref: policyIdByName('gagnechris-prod-api-security-headers'),
    };
    for (const host of ['admin.gagnechris.com', 'notebook.gagnechris.com']) {
      const config = distributionFor(host);
      const api = behavior(config, '/api/*');
      expect(api, host).toBeDefined();
      expect(api!.ResponseHeadersPolicyId).toEqual(apiPolicy);
      expect(api!.AllowedMethods).toHaveLength(7);
      // Managed CachingDisabled / AllViewerExceptHostHeader.
      expect(api!.CachePolicyId).toBe('4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
      expect(api!.OriginRequestPolicyId).toBe(
        'b689b0a8-53d0-40ab-baf2-68738e2966ac',
      );
      const origin = (config.Origins as Array<Record<string, Json>>).find(
        (o) => o.Id === api!.TargetOriginId,
      );
      expect(JSON.stringify(origin!.DomainName)).toContain('httpapiid');
      expect(JSON.stringify(origin!.DomainName)).toContain('execute-api');
    }
  });

  it('serves /media/* from the site bucket on admin only', () => {
    const admin = distributionFor('admin.gagnechris.com');
    const media = behavior(admin, '/media/*');
    expect(media).toBeDefined();
    expect(media!.ResponseHeadersPolicyId).toEqual({
      Ref: policyIdByName('gagnechris-prod-admin-app-security-headers'),
    });
    const origin = (admin.Origins as Array<Record<string, Json>>).find(
      (o) => o.Id === media!.TargetOriginId,
    );
    expect(JSON.stringify(origin!.DomainName)).toContain('SiteBucket');

    const notebook = distributionFor('notebook.gagnechris.com');
    expect(behavior(notebook, '/media/*')).toBeUndefined();
    expect(
      (notebook.CacheBehaviors as Array<{ PathPattern: string }>)
        .map((b) => b.PathPattern)
        .sort(),
    ).toEqual(['/api/*', '/assets/*']);

    const sitePolicy = Object.entries(
      resourcesOf(built.site, 'AWS::S3::BucketPolicy'),
    ).find(([id]) => id.startsWith('SiteBucketPolicy'))![1];
    const statements = sitePolicy.Properties.PolicyDocument.Statement as Array<
      Record<string, Json>
    >;
    const adminGet = statements.find(
      (s) =>
        s.Action === 's3:GetObject' &&
        JSON.stringify(s.Condition).includes('AdminHostDistribution'),
    );
    expect(adminGet).toBeDefined();
    const notebookAccess = statements.find((s) =>
      JSON.stringify(s.Condition ?? {}).includes('NotebookHostDistribution'),
    );
    expect(notebookAccess).toBeUndefined();
  });

  it('allows presigned PUTs from the admin host only in the site bucket CORS', () => {
    const siteBucket = Object.entries(
      resourcesOf(built.site, 'AWS::S3::Bucket'),
    ).find(([id]) => id.startsWith('SiteBucket'))![1];
    expect(
      siteBucket.Properties.CorsConfiguration.CorsRules[0].AllowedOrigins,
    ).toEqual(['https://admin.gagnechris.com']);
  });

  it('gives each host a private bucket, a KVS-free SPA fallback, a 5xx alarm and SSM params', () => {
    const fns = resourcesOf(built.site, 'AWS::CloudFront::Function');
    const appFn = Object.entries(fns).find(
      ([, f]) => f.Properties.Name === 'gagnechris-prod-app-viewer-request',
    );
    expect(appFn).toBeDefined();
    expect(
      appFn![1].Properties.FunctionConfig.KeyValueStoreAssociations,
    ).toBeUndefined();

    for (const [host, app] of [
      ['admin.gagnechris.com', 'admin'],
      ['notebook.gagnechris.com', 'notebook'],
    ] as const) {
      const config = distributionFor(host);
      expect(config.DefaultCacheBehavior.FunctionAssociations).toEqual([
        {
          EventType: 'viewer-request',
          FunctionARN: { 'Fn::GetAtt': [appFn![0], 'FunctionARN'] },
        },
      ]);
      expect(config.Logging.Prefix).toBe(`cloudfront-${app}/`);
      built.site.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: `gagnechris-prod-${app}-cloudfront-5xx`,
        MetricName: '5xxErrorRate',
        Threshold: 5,
      });
      built.site.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/gagnechris/prod/${app}-site-bucket-name`,
      });
      built.site.hasResourceProperties('AWS::SSM::Parameter', {
        Name: `/gagnechris/prod/${app}-cloudfront-distribution-id`,
      });
      built.site.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: { Status: 'Enabled' },
        LoggingConfiguration: Match.objectLike({
          LogFilePrefix: `s3-${app}/`,
        }),
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    }
  });

  it('writes a placeholder index.html once, on create only', () => {
    const placeholders = Object.values(
      resourcesOf(built.site, 'Custom::AWS'),
    ).filter((r) => JSON.stringify(r.Properties.Create).includes('index.html'));
    expect(placeholders).toHaveLength(2);
    for (const resource of placeholders) {
      expect(resource.Properties.Update).toBeUndefined();
      expect(resource.Properties.Delete).toBeUndefined();
      const create = JSON.stringify(resource.Properties.Create);
      expect(create).toContain('putObject');
      expect(create).not.toMatch(/<script/i);
      expect(create).not.toMatch(/gtag|googletagmanager/);
    }
  });
});

describe('app hosts: Cognito', () => {
  const clients = () =>
    Object.values(resourcesOf(built.auth, 'AWS::Cognito::UserPoolClient'));
  const client = (name: string) =>
    clients().find((c) => c.Properties.ClientName === name)!.Properties;

  it('registers only its own host on each app client', () => {
    for (const [name, host] of [
      ['admin-web', 'admin.gagnechris.com'],
      ['notebook-web', 'notebook.gagnechris.com'],
    ] as const) {
      const props = client(name);
      expect(props.CallbackURLs).toEqual([`https://${host}/auth/callback`]);
      expect(props.LogoutURLs).toEqual([`https://${host}/`]);
      expect(props.GenerateSecret).toBe(false);
      expect(props.AllowedOAuthFlows).toEqual(['code']);
      expect(props.EnableTokenRevocation).toBe(true);
      expect(props.RefreshTokenValidity).toBe(43200);
    }
  });

  // Deleting or renaming one of these logical IDs replaces the client and
  // signs out every device holding its refresh tokens.
  it('has exactly the four clients, under stable logical IDs', () => {
    const byId = Object.fromEntries(
      Object.entries(
        resourcesOf(built.auth, 'AWS::Cognito::UserPoolClient'),
      ).map(([id, c]) => [id, c.Properties.ClientName]),
    );
    expect(byId).toEqual({
      UserPoolAdminWebClient5CA64CB9: 'admin-web',
      UserPoolNotebookWebClient2C352CC5: 'notebook-web',
      UserPoolIosClientD1604E26: 'ios',
      UserPoolDevClient09BBD8DF: 'dev-local',
    });
  });

  it('gives each app client managed login branding', () => {
    const brandings = JSON.stringify(
      resourcesOf(built.auth, 'AWS::Cognito::ManagedLoginBranding'),
    );
    expect(brandings).toMatch(/UserPoolAdminWebClient/);
    expect(brandings).toMatch(/UserPoolNotebookWebClient/);
  });

  it('creates only the site-admin and notebook groups, with the owner in both', () => {
    const groupNames = Object.fromEntries(
      Object.entries(
        resourcesOf(built.auth, 'AWS::Cognito::UserPoolGroup'),
      ).map(([id, g]) => [id, g.Properties.GroupName]),
    );
    expect(groupNames).toEqual({
      SiteAdminGroup: 'site-admin',
      NotebookGroup: 'notebook',
    });
    const memberships = Object.fromEntries(
      Object.entries(
        resourcesOf(built.auth, 'AWS::Cognito::UserPoolUserToGroupAttachment'),
      ).map(([id, a]) => [id, a.Properties]),
    );
    expect(memberships).toEqual({
      SiteAdminGroupMembership: expect.objectContaining({
        GroupName: { Ref: 'SiteAdminGroup' },
        Username: 'owner@example.com',
      }),
      NotebookGroupMembership: expect.objectContaining({
        GroupName: { Ref: 'NotebookGroup' },
        Username: 'owner@example.com',
      }),
    });
  });

  it('publishes both client IDs to SSM', () => {
    for (const [key, logicalPrefix] of [
      ['cognito-admin-web-client-id', 'UserPoolAdminWebClient'],
      ['cognito-notebook-web-client-id', 'UserPoolNotebookWebClient'],
    ] as const) {
      const param = Object.values(
        resourcesOf(built.auth, 'AWS::SSM::Parameter'),
      ).find((p) => p.Properties.Name === `/gagnechris/prod/${key}`);
      expect(param, key).toBeDefined();
      expect(JSON.stringify(param!.Properties.Value)).toContain(logicalPrefix);
    }
  });
});

describe('app hosts: API Gateway', () => {
  function authorizersByRoute(template: Template) {
    const authorizers = resourcesOf(template, 'AWS::ApiGatewayV2::Authorizer');
    const routes = Object.values(
      resourcesOf(template, 'AWS::ApiGatewayV2::Route'),
    );
    const byRoute: Record<string, string> = {};
    for (const route of routes) {
      const ref = route.Properties.AuthorizerId?.Ref as string | undefined;
      if (ref) {
        byRoute[route.Properties.RouteKey] = JSON.stringify(
          authorizers[ref]!.Properties.JwtConfiguration.Audience,
        );
      }
    }
    return byRoute;
  }

  it('checks each prefix against its own client only', () => {
    const byRoute = authorizersByRoute(built.api);
    for (const [keys, own, other] of [
      [
        ['ANY /api/admin', 'ANY /api/admin/{proxy+}'],
        'cognitoadminwebclientid',
        /notebook|IosClient|DevClient/i,
      ],
      [
        ['ANY /api/notebook', 'ANY /api/notebook/{proxy+}'],
        'cognitonotebookwebclientid',
        /adminweb|IosClient|DevClient/i,
      ],
    ] as const) {
      for (const key of keys) {
        const audience = JSON.parse(byRoute[key]!);
        expect(audience, key).toHaveLength(1);
        expect(JSON.stringify(audience[0])).toContain(own);
        expect(byRoute[key]).not.toMatch(other);
        expect(byRoute[key]).not.toMatch(/ImportValue|UserPoolWebClient/);
      }
    }
    const params = built.api.toJSON().Parameters as Record<
      string,
      { Default?: string }
    >;
    const defaults = Object.values(params).map((p) => p.Default);
    expect(defaults).toContain('/gagnechris/prod/cognito-admin-web-client-id');
    expect(defaults).toContain(
      '/gagnechris/prod/cognito-notebook-web-client-id',
    );
  });

  it('passes only the two app client IDs to the Lambda', () => {
    const fn = Object.values(
      resourcesOf(built.api, 'AWS::Lambda::Function'),
    ).find((f) => f.Properties.FunctionName === 'gagnechris-prod-api')!;
    const vars = fn.Properties.Environment.Variables;
    expect(vars.ADMIN_WEB_CLIENT_ID).toEqual({
      Ref: expect.stringMatching(/cognitoadminwebclientid/),
    });
    expect(vars.NOTEBOOK_WEB_CLIENT_ID).toEqual({
      Ref: expect.stringMatching(/cognitonotebookwebclientid/),
    });
    expect(vars.AUTH_LEGACY_WEB_CLIENT_ID).toBeUndefined();
  });

  it('leaves no trace of the web client in Auth or Api', () => {
    const auth = JSON.stringify(built.auth.toJSON());
    expect(auth).not.toMatch(
      /UserPoolWebClient|"WebClientIdParam|cognito-web-client-id/,
    );
    expect(Object.keys(built.auth.toJSON().Outputs)).not.toContain(
      'WebClientId',
    );
    expect(JSON.stringify(built.api.toJSON())).not.toMatch(
      /UserPoolWebClient|cognito-web-client-id/,
    );
  });
});

describe('app-viewer-request function', () => {
  const source = readFileSync(
    join(__dirname, '../lib/cloudfront/app-viewer-request.js'),
    'utf8',
  );
  const handler = new Function(`${source}; return handler;`)() as (event: {
    request: { uri: string };
  }) => { uri: string };
  const rewrite = (uri: string) => handler({ request: { uri } }).uri;

  it('rewrites app routes to /index.html', () => {
    for (const uri of [
      '/',
      '/posts',
      '/posts/new',
      '/notes/abc/',
      '/auth/callback',
      '/Today',
      '/apix',
      '/assetsfoo/bar',
    ]) {
      expect(rewrite(uri), uri).toBe('/index.html');
    }
  });

  it('passes /api, /assets, /media, /.well-known and files through', () => {
    for (const uri of [
      '/api',
      '/api/health',
      '/assets/index-abc.js',
      '/assets/chunk',
      '/media/2026/x',
      '/.well-known/apple-app-site-association',
      '/favicon.svg',
      '/manifest.json',
      '/index.html',
      '/icons/icon-192.png',
    ]) {
      expect(rewrite(uri), uri).toBe(uri);
    }
  });
});
