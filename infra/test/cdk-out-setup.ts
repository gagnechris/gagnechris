import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CDK_OUT_ROOT_ENV } from './helpers/test-app.js';

export default function setup(): () => void {
  const root = mkdtempSync(join(tmpdir(), 'gagnechris-infra-cdk-out-'));
  process.env[CDK_OUT_ROOT_ENV] = root;
  return () => rmSync(root, { recursive: true, force: true });
}
