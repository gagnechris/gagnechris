import { Aspects, App } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { applyStandardTags } from '../lib/aspects/standard-tags.js';
import { getEnvironment, parseEnvironmentName } from '../lib/config/environments.js';
import { CertificateStack } from '../lib/stacks/certificate-stack.js';
import { CiDeployRoleStack } from '../lib/stacks/ci-deploy-role-stack.js';
import { DnsStack } from '../lib/stacks/dns-stack.js';
import { GuardrailsStack } from '../lib/stacks/guardrails-stack.js';
import { SiteStack } from '../lib/stacks/site-stack.js';

const app = new App();

// Default is prod. Staging is available later via `-c env=staging` (not deployed by default).
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

new DnsStack(app, `Dns-${config.name}`, {
  env: stackEnv,
  description: `DNS records for gagnechris.com (${config.name}).`,
  crossRegionReferences: true,
  config,
});

const certificate = new CertificateStack(app, `Certificate-${config.name}`, {
  env: certificateEnv,
  description: `ACM certificate in us-east-1 for CloudFront (${config.name}).`,
  crossRegionReferences: true,
  config,
});

const guardrails = new GuardrailsStack(app, `Guardrails-${config.name}`, {
  env: stackEnv,
  description: `Cost and security guardrails (${config.name}).`,
  config,
});

new SiteStack(app, `Site-${config.name}`, {
  env: stackEnv,
  description: `Static site hosting (${config.name}).`,
  crossRegionReferences: true,
  config,
  certificate: certificate.certificate,
  alertsTopic: guardrails.alertsTopic,
});

new CiDeployRoleStack(app, `CiDeployRole-${config.name}`, {
  env: stackEnv,
  description: `GitHub Actions OIDC deploy/diff roles (${config.name}).`,
  config,
});

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

app.synth();
