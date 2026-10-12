import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(
  fileURLToPath(new URL('../../..', import.meta.url)),
);

// A hand-built CreateTable input drifts from gsiProjection (INCLUDE loses its
// NonKeyAttributes), so both local table creators must use the shared one.
describe.each([
  'services/api/test/support/dynamo-local.ts',
  'scripts/local/bootstrap-table.ts',
])('%s', (file) => {
  const source = readFileSync(path.join(repoRoot, file), 'utf8');

  it('creates the table from appTableCreateInput', () => {
    expect(source).toMatch(/\bappTableCreateInput\(/);
  });

  it('builds no GSI projection or key schema of its own', () => {
    expect(source).not.toMatch(/\b(Projection|ProjectionType|KeySchema)\s*:/);
    expect(source).not.toMatch(/\bgsiProjection\b/);
  });
});
