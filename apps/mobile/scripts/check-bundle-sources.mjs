/**
 * Guard the exported iOS bundle against type-only modules and zod major
 * mismatches (CHR-150 / CHR-164).
 *
 * `zod` ships `external.js` next to `external.d.ts`; a resolver that remaps
 * `.js` → `.d.ts` bundles the declaration, which has no runtime. The export
 * still succeeds, so the sourcemap is the only place the mistake is visible.
 *
 * Shared is typechecked against zod ^4, but Metro can still resolve Expo CLI's
 * transitive zod 3 — require `zod/v4/` paths and reject `zod/v3/`.
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
  const zodSources = sources.filter((source) =>
    /node_modules\/zod\//.test(source),
  );
  const hasZodV4 = zodSources.some((source) => /\/zod\/v4\//.test(source));
  const hasZodV3 = zodSources.some((source) => /\/zod\/v3\//.test(source));

  if (declarations.length > 0) {
    failures.push(
      `${map}: ${declarations.length} type-only source(s)\n  ${declarations.join('\n  ')}`,
    );
  }
  if (zodSources.length === 0) {
    failures.push(`${map}: no zod runtime module in ${sources.length} sources`);
  } else if (!hasZodV4) {
    failures.push(
      `${map}: zod sources present but none under zod/v4/ (got:\n  ${zodSources.join('\n  ')})`,
    );
  }
  if (hasZodV3) {
    failures.push(
      `${map}: zod/v3/ sources must not ship (shared targets zod 4):\n  ${zodSources.filter((s) => /\/zod\/v3\//.test(s)).join('\n  ')}`,
    );
  }
  if (declarations.length === 0 && hasZodV4 && !hasZodV3) {
    console.log(
      `${map}: ${sources.length} sources, no .d.ts, zod/v4 runtime present`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\nBundle source check failed:\n${failures.join('\n')}`);
  process.exit(1);
}
