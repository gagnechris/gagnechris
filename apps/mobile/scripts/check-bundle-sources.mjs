/**
 * Guard the exported iOS bundle against type-only modules (CHR-150).
 *
 * `zod` ships `external.js` next to `external.d.ts`; a resolver that remaps
 * `.js` → `.d.ts` bundles the declaration, which has no runtime. The export
 * still succeeds, so the sourcemap is the only place the mistake is visible.
 *
 * Usage: node scripts/check-bundle-sources.mjs <export-dir>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const exportDir = process.argv[2];
if (!exportDir) {
  throw new Error('Usage: node scripts/check-bundle-sources.mjs <export-dir>');
}

function findMaps(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return findMaps(full);
    return name.endsWith('.map') ? [full] : [];
  });
}

const maps = findMaps(exportDir);
if (maps.length === 0) {
  throw new Error(
    `No sourcemaps under ${exportDir} — export with \`--source-maps\``,
  );
}

const failures = [];
for (const map of maps) {
  const { sources = [] } = JSON.parse(readFileSync(map, 'utf8'));
  const declarations = sources.filter((source) => source.endsWith('.d.ts'));
  // A bundle without zod at all would pass the declaration check vacuously.
  const hasZodRuntime = sources.some((source) =>
    /node_modules\/zod\/.*\.js$/.test(source),
  );

  if (declarations.length > 0) {
    failures.push(
      `${map}: ${declarations.length} type-only source(s)\n  ${declarations.join('\n  ')}`,
    );
  }
  if (!hasZodRuntime) {
    failures.push(`${map}: no zod runtime module in ${sources.length} sources`);
  }
  if (declarations.length === 0 && hasZodRuntime) {
    console.log(
      `${map}: ${sources.length} sources, no .d.ts, zod runtime present`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\nBundle source check failed:\n${failures.join('\n')}`);
  process.exit(1);
}
