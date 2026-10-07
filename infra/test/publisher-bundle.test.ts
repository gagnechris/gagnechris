import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTERNAL_MODULES,
  REPO_ROOT,
} from '../lib/constructs/node-lambda.js';
import { PUBLISHER_BUNDLE_DEFINE } from '../lib/stacks/publisher-stack.js';

describe('publisher Lambda bundle', () => {
  const result = buildSync({
    entryPoints: [join(REPO_ROOT, 'services/publisher/src/handler.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    minify: true,
    external: [...DEFAULT_EXTERNAL_MODULES],
    define: PUBLISHER_BUNDLE_DEFINE,
    metafile: true,
    write: false,
    logLevel: 'silent',
  });
  const inputs = Object.entries(
    Object.values(result.metafile.outputs)[0]!.inputs,
  ).flatMap(([path, { bytesInOutput }]) => (bytesInOutput > 0 ? [path] : []));

  it('renders with the production React build only', () => {
    expect(
      inputs.some((p) => /react-dom-server\.node\.production/.test(p)),
    ).toBe(true);
    expect(
      inputs.filter((p) => /\/react(-dom)?\/.*development/.test(p)),
    ).toEqual([]);
  });
});
