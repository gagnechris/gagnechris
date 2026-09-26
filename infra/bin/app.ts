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

const envName = parseEnvironmentName(app.node.tryGetContext('env'));
const config = getEnvironment(envName);

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
  description: `DNS lookups and records (${config.name}). Filled in by CHR-21.`,
  crossRegionReferences: true,
});

new CertificateStack(app, `Certificate-${config.name}`, {
  env: certificateEnv,
  description: `ACM certificate in us-east-1 for CloudFront (${config.name}). Filled in by CHR-21.`,
  crossRegionReferences: true,
});

new SiteStack(app, `Site-${config.name}`, {
  env: stackEnv,
  description: `Static site hosting (${config.name}).`,
  crossRegionReferences: true,
});

new GuardrailsStack(app, `Guardrails-${config.name}`, {
  env: stackEnv,
  description: `Cost and security guardrails (${config.name}). Filled in by CHR-20.`,
});

new CiDeployRoleStack(app, `CiDeployRole-${config.name}`, {
  env: stackEnv,
  description: `GitHub Actions OIDC deploy role (${config.name}). Filled in by CHR-19.`,
});

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

app.synth();
