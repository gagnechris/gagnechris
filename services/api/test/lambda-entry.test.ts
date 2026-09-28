import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Lambda bundle boundary (CHR-78)', () => {
  it('ApiStack entry is services/api/src/handler.ts only', () => {
    const stack = readFileSync(
      join(root, 'infra/lib/stacks/api-stack.ts'),
      'utf8',
    );
    expect(stack).toContain(
      "entry: join(REPO_ROOT, 'services/api/src/handler.ts')",
    );
    expect(stack).not.toMatch(/local\/server/);
  });

  it('handler.ts has no local auth bypass', () => {
    const handler = readFileSync(
      join(root, 'services/api/src/handler.ts'),
      'utf8',
    );
    expect(handler).not.toMatch(/VITE_AUTH_MODE|local-dev|auth.?bypass/i);
    expect(handler).not.toMatch(/NODE_ENV.*local/i);
  });
});
