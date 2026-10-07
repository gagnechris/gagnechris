import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HARNESS = 'infra/lib/cloudfront/harness.ts';
const FUNCTION_FILE =
  /(?:viewer-request-function|viewer-response-function|app-viewer-request)\.js/;

const tracked = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.mjs'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

describe('the CloudFront harness', () => {
  it('is the only code that evaluates a CloudFront function source', () => {
    const loaders = tracked.filter((file) => {
      const text = readFileSync(join(ROOT, file), 'utf8');
      return /new Function\(/.test(text) && FUNCTION_FILE.test(text);
    });
    expect(loaders).toEqual([HARNESS]);
  });

  it('runs the local static server', () => {
    expect(
      readFileSync(join(ROOT, 'services/api/local/static-server.ts'), 'utf8'),
    ).toContain("from '@gagnechris/infra/cloudfront-harness'");
  });
});
