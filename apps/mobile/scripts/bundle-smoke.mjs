/**
 * `expo export` only proves the graph can be walked: a module that resolves to
 * a type-only `.d.ts` bundles fine and throws at load, so this executes the
 * bundle. RN core init and polyfills are dropped so plain Node is enough.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Metro is Expo's own dependency, not a direct one — resolve the same copy the
// Expo CLI uses instead of whatever happens to be hoisted.
const Metro = createRequire(import.meta.resolve('expo/metro-config'))('metro');

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'mobile-bundle-smoke-'));
const out = join(outDir, 'smoke.js');

const config = await Metro.loadConfig({ cwd: projectRoot });
config.serializer.getModulesRunBeforeMainModule = () => [];
config.serializer.getPolyfills = () => [];

await Metro.runBuild(config, {
  entry: 'scripts/smoke-entry.ts',
  platform: 'ios',
  dev: false,
  minify: false,
  sourceMap: false,
  out,
});

const stdout = execFileSync(process.execPath, [out], { encoding: 'utf8' });
process.stdout.write(stdout);
if (!stdout.includes('bundle smoke ok')) {
  throw new Error('Bundle ran but did not reach the smoke assertions');
}
