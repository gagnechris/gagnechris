import { Aspects, App } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { applyStandardTags } from '../lib/aspects/standard-tags.js';
import {
  getEnvironment,
  parseEnvironmentName,
} from '../lib/config/environments.js';
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
  alertsTopic: guardrails.alertsTopic,
});

// Email looks up the hosted zone itself (not via Dns) so Site can depend on
// Api without a cycle through Dns → Email → Api.
const email = new EmailStack(app, `Email-${config.name}`, {
  env: stackEnv,
  description: `SES domain identity for transactional email (${config.name}).`,
  config,
});

const auth = new AuthStack(app, `Auth-${config.name}`, {
  env: stackEnv,
  description: `Cognito user pool and managed login (${config.name}).`,
  config,
  certificate: certificate.authCertificate,
});

// Api before Site so Site's /api origin picks up http-api-id on the same
// deploy when the HttpApi is replaced. Api still needs Site's
// site-bucket-name SSM; see RUNBOOK two-pass bootstrap.
const api = new ApiStack(app, `Api-${config.name}`, {
  env: stackEnv,
  description: `HTTP API + Lambda behind CloudFront /api (${config.name}).`,
  config,
  userPool: auth.userPool,
  webClient: auth.webClient,
  alertsTopic: guardrails.alertsTopic,
  dataTable: data.table,
  emailIdentity: email.emailIdentity,
  notifyEmailIdentity: email.notifyEmailIdentity,
  fromEmail: email.fromEmail,
});
// Api reads the app client IDs from Auth's SSM params, which must exist first.
api.node.addDependency(auth);

const site = new SiteStack(app, `Site-${config.name}`, {
  env: stackEnv,
  description: `Static site hosting (${config.name}).`,
  config,
  certificate: certificate.certificate,
  appHostsCertificate: certificate.appHostsCertificate,
  alertsTopic: guardrails.alertsTopic,
});
site.node.addDependency(api);

// Direct distribution ref is intentional: Route 53 alias targets need the
// distribution domain and hosted-zone IDs.
new DnsStack(app, `Dns-${config.name}`, {
  env: stackEnv,
  description: `DNS records for ${config.domainName} (${config.name}).`,
  config,
  distribution: site.distribution,
  adminDistribution: site.adminHost.distribution,
  notebookDistribution: site.notebookHost.distribution,
});

const publisher = new PublisherStack(app, `Publisher-${config.name}`, {
  env: stackEnv,
  description: `DynamoDB Streams publisher for static blog pages (${config.name}).`,
  config,
  dataTable: data.table,
  alertsTopic: guardrails.alertsTopic,
});
// Site must write bucket / distribution / KVS SSM params before Publisher.
publisher.node.addDependency(site);

new CiDeployRoleStack(app, `CiDeployRole-${config.name}`, {
  env: stackEnv,
  description: `GitHub Actions OIDC deploy/diff/drift roles (${config.name}).`,
  config,
  alertsTopic: guardrails.alertsTopic,
});

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

app.synth();
