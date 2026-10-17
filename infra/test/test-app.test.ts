import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Stack } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';
import setup from './cdk-out-setup.js';
import { CDK_OUT_ROOT_ENV, testApp } from './helpers/test-app.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'fixtures') return [];
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsFiles(path);
    return e.name.endsWith('.ts') ? [path] : [];
  });
}

describe('testApp', () => {
  it('synthesizes under the run root, never a cdk.out of its own in the temp dir', () => {
    const root = process.env[CDK_OUT_ROOT_ENV]!;
    const app = testApp();
    new Stack(app, 'Empty');
    app.synth();
    expect(app.outdir.startsWith(`${root}/`)).toBe(true);
  });

  it('leaves nothing behind once the run root is torn down', () => {
    const outer = process.env[CDK_OUT_ROOT_ENV];
    const teardown = setup();
    const root = process.env[CDK_OUT_ROOT_ENV]!;
    try {
      const app = testApp();
      new Stack(app, 'Empty');
      app.synth();
      expect(existsSync(join(app.outdir, 'manifest.json'))).toBe(true);
    } finally {
      teardown();
      process.env[CDK_OUT_ROOT_ENV] = outer;
    }
    expect(existsSync(root)).toBe(false);
  });

  it('is the only way an infra test makes an App', () => {
    const helper = join(TEST_DIR, 'helpers', 'test-app.ts');
    const offenders = tsFiles(TEST_DIR)
      .filter((f) => f !== helper && f !== fileURLToPath(import.meta.url))
      .filter((f) => /\bnew\s+(?:cdk\.)?App\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(TEST_DIR, f));
    expect(offenders).toEqual([]);
  });
});
