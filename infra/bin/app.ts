import { Aspects, App } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { applyStandardTags } from '../lib/aspects/standard-tags.js';
import { getEnvironment, parseEnvironmentName } from '../lib/config/environments.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { CertificateStack } from '../lib/stacks/certificate-stack.js';
import { CiDeployRoleStack } from '../lib/stacks/ci-deploy-role-stack.js';
import { DataStack } from '../lib/stacks/data-stack.js';
import { DnsStack } from '../lib/stacks/dns-stack.js';
import { EmailStack } from '../lib/stacks/email-stack.js';
import { GuardrailsStack } from '../lib/stacks/guardrails-stack.js';
import { PublisherStack } from '../lib/stacks/publisher-stack.js';
import { SiteStack } from '../lib/stacks/site-stack.js';

const app = new App();

// Prod only (staging was removed — CHR-66 / CHR-68).
const envName = parseEnvironmentName(app.node.tryGetContext('env'));
const config = getEnvironment(
  envName,
  process.env,
  app.node.tryGetContext('alertsEmail'),
);

applyStandardTags(app, config);

const stackEnv = {
  account: config.account,
  region: config.region,
};

const certificateEnv = {
  account: config.account,
  region: 'us-east-1' as const,
};

const certificate = new CertificateStack(app, `Certificate-${config.name}`, {
  env: certificateEnv,
  description: `ACM certificate in us-east-1 for CloudFront and Cognito (${config.name}).`,
  config,
});

const guardrails = new GuardrailsStack(app, `Guardrails-${config.name}`, {
  env: stackEnv,
  description: `Cost and security guardrails (${config.name}).`,
  config,
});

const data = new DataStack(app, `Data-${config.name}`, {
  env: stackEnv,
  description: `DynamoDB single-table for posts and notebook (${config.name}).`,
  config,
});

const site = new SiteStack(app, `Site-${config.name}`, {
  env: stackEnv,
  description: `Static site hosting (${config.name}).`,
  config,
  certificate: certificate.certificate,
  alertsTopic: guardrails.alertsTopic,
});

// DNS after Site so apex/www can alias to the CloudFront distribution (CHR-25).
// Direct distribution ref is intentional: Route 53 alias targets need the
// distribution domain/hosted-zone IDs (SSM alone is awkward for AliasTarget).
const dns = new DnsStack(app, `Dns-${config.name}`, {
  env: stackEnv,
  description: `DNS records for ${config.domainName} (${config.name}).`,
  config,
  distribution: site.distribution,
});

const email = new EmailStack(app, `Email-${config.name}`, {
  env: stackEnv,
  description: `SES domain identity for transactional email (${config.name}).`,
  config,
  hostedZone: dns.hostedZone,
});

const auth = new AuthStack(app, `Auth-${config.name}`, {
  env: stackEnv,
  description: `Cognito user pool and managed login (${config.name}).`,
  config,
  certificate: certificate.authCertificate,
});

// Api after Site so this deploy updates Site's /api origin to SSM before Api
// drops the old CloudFormation export (CHR-135; avoids ImportValue breakage).
const api = new ApiStack(app, `Api-${config.name}`, {
  env: stackEnv,
  description: `HTTP API + Lambda behind CloudFront /api (${config.name}).`,
  config,
  userPool: auth.userPool,
  webClient: auth.webClient,
  iosClient: auth.iosClient,
  alertsTopic: guardrails.alertsTopic,
  dataTable: data.table,
  emailIdentity: email.emailIdentity,
  notifyEmailIdentity: email.notifyEmailIdentity,
  fromEmail: email.fromEmail,
});
api.node.addDependency(site);

new PublisherStack(app, `Publisher-${config.name}`, {
  env: stackEnv,
  description: `DynamoDB Streams publisher for static blog pages (${config.name}).`,
  config,
  dataTable: data.table,
  siteBucket: site.siteBucket,
  blogSlugsKeyValueStoreArn: site.blogSlugsKeyValueStoreArn,
  alertsTopic: guardrails.alertsTopic,
});

new CiDeployRoleStack(app, `CiDeployRole-${config.name}`, {
  env: stackEnv,
  description: `GitHub Actions OIDC deploy/diff roles (${config.name}).`,
  config,
});

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

app.synth();
