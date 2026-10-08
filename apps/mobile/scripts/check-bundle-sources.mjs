/**
 * A resolver that remaps zod's `.js` to `.d.ts` bundles a declaration with no
 * runtime and the export still succeeds, so the sourcemap is the only place it
 * shows. Shared targets zod 4, but Metro can still resolve Expo CLI's zod 3.
 * It also fails when the app graph stops reaching app-core, react-query, the
 * cache persister, NetInfo, the expo-crypto polyfill, or expo-router.
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

// The app's own graph must reach these, or the bundle checks above prove
// nothing about them.
const requiredSources = {
  '@gagnechris/app-core': /\/packages\/app-core\/src\//,
  '@tanstack/react-query': /node_modules\/@tanstack\/react-query\//,
  '@tanstack/query-async-storage-persister':
    /node_modules\/@tanstack\/query-async-storage-persister\//,
  '@react-native-community/netinfo':
    /node_modules\/@react-native-community\/netinfo\//,
  'expo-crypto': /node_modules\/expo-crypto\//,
  'expo-router': /node_modules\/expo-router\//,
};

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
  const missing = Object.entries(requiredSources)
    .filter(([, pattern]) => !sources.some((source) => pattern.test(source)))
    .map(([name]) => name);
  if (missing.length > 0) {
    failures.push(`${map}: no sources from ${missing.join(', ')}`);
  }
  if (
    declarations.length === 0 &&
    hasZodV4 &&
    !hasZodV3 &&
    missing.length === 0
  ) {
    console.log(
      `${map}: ${sources.length} sources, no .d.ts, zod/v4 runtime, ${Object.keys(requiredSources).join(', ')} present`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\nBundle source check failed:\n${failures.join('\n')}`);
  process.exit(1);
}
