import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { App, type AppProps } from 'aws-cdk-lib';

export const CDK_OUT_ROOT_ENV = 'INFRA_TEST_CDK_OUT_ROOT';

// A plain App synthesizes into its own /tmp/cdk.out* (tens of MB) that nothing
// removes; this one synthesizes under the run's root, which teardown deletes.
export function testApp(props: AppProps = {}): App {
  const root = process.env[CDK_OUT_ROOT_ENV];
  if (!root) {
    throw new Error(
      `${CDK_OUT_ROOT_ENV} is unset: run infra tests through vitest, whose global setup creates it`,
    );
  }
  return new App({ ...props, outdir: mkdtempSync(join(root, 'cdk.out-')) });
}
