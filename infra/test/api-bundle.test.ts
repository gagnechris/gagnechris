import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTERNAL_MODULES,
  REPO_ROOT,
} from '../lib/constructs/node-lambda.js';

// Every byte and module here is parsed on each API cold start.
describe('API Lambda bundle', () => {
  const result = buildSync({
    entryPoints: [join(REPO_ROOT, 'services/api/src/handler.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    minify: true,
    external: [...DEFAULT_EXTERNAL_MODULES],
    metafile: true,
    write: false,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0]!.text;
  const inputs = Object.entries(
    Object.values(result.metafile.outputs)[0]!.inputs,
  ).flatMap(([path, { bytesInOutput }]) => (bytesInOutput > 0 ? [path] : []));

  it('stays small', () => {
    expect(code.length).toBeLessThan(350_000);
  });

  it('tree-shakes zod (namespace import, no bundled locales)', () => {
    expect(
      inputs.filter((p) => /zod\/v4\/locales\/(?!en\.js|index\.js)/.test(p)),
    ).toEqual([]);
  });

  it('loads the AWS SDK with require, never a bare import()', () => {
    expect(code).not.toMatch(/import\(["']@aws-sdk\//);
  });

  it('requires only the DynamoDB SDK at module load', () => {
    const dir = mkdtempSync(join(tmpdir(), 'api-bundle-'));
    const file = join(dir, 'index.js');
    writeFileSync(file, code);
    const probe = `
      const Module = require('node:module');
      const seen = new Set();
      const load = Module._load;
      Module._load = function (request, parent, ...rest) {
        if (parent?.filename === ${JSON.stringify(file)}) seen.add(request);
        return load.call(this, request, parent, ...rest);
      };
      require(${JSON.stringify(file)});
      process.stdout.write(JSON.stringify([...seen].sort()));
    `;
    try {
      const out = execFileSync(process.execPath, ['-e', probe], {
        env: { ...process.env, NODE_PATH: join(REPO_ROOT, 'node_modules') },
        encoding: 'utf8',
      });
      expect(
        JSON.parse(out).filter((id: string) => id.startsWith('@aws-sdk/')),
      ).toEqual(['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
