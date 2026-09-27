import { Aspects, App } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { applyStandardTags } from '../lib/aspects/standard-tags.js';
import { getEnvironment, parseEnvironmentName } from '../lib/config/environments.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { CertificateStack } from '../lib/stacks/certificate-stack.js';
import { CiDeployRoleStack } from '../lib/stacks/ci-deploy-role-stack.js';
import { DnsStack } from '../lib/stacks/dns-stack.js';
import { GuardrailsStack } from '../lib/stacks/guardrails-stack.js';
import { SiteStack } from '../lib/stacks/site-stack.js';

const app = new App();

// CHR-65 throwaway: intentional synth failure to prove CDK diff fails the job.
throw new Error('CHR-65 throwaway: intentional synth failure — do not merge');

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
  crossRegionReferences: true,
  config,
});

const guardrails = new GuardrailsStack(app, `Guardrails-${config.name}`, {
  env: stackEnv,
  description: `Cost and security guardrails (${config.name}).`,
  config,
});

const site = new SiteStack(app, `Site-${config.name}`, {
  env: stackEnv,
  description: `Static site hosting (${config.name}).`,
  crossRegionReferences: true,
  config,
  certificate: certificate.certificate,
  alertsTopic: guardrails.alertsTopic,
});

// DNS after Site so apex/www can alias to the CloudFront distribution (CHR-25).
new DnsStack(app, `Dns-${config.name}`, {
  env: stackEnv,
  description: `DNS records for gagnechris.com (${config.name}).`,
  crossRegionReferences: true,
  config,
  distribution: site.distribution,
});

const auth = new AuthStack(app, `Auth-${config.name}`, {
  env: stackEnv,
  description: `Cognito user pool and managed login (${config.name}).`,
  crossRegionReferences: true,
  config,
  certificate: certificate.authCertificate,
});

new ApiStack(app, `Api-${config.name}`, {
  env: stackEnv,
  description: `HTTP API + Lambda behind CloudFront /api (${config.name}).`,
  config,
  userPool: auth.userPool,
  webClient: auth.webClient,
  iosClient: auth.iosClient,
  distribution: site.distribution,
  alertsTopic: guardrails.alertsTopic,
});

new CiDeployRoleStack(app, `CiDeployRole-${config.name}`, {
  env: stackEnv,
  description: `GitHub Actions OIDC deploy/diff roles (${config.name}).`,
  config,
});

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

app.synth();
