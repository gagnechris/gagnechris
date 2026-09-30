/**
 * Build a Metro bundle with this app's real `metro.config.js` and execute it in
 * Node (CHR-150).
 *
 * `expo export` only proves the graph can be walked; the CHR-142 crash was a
 * module that resolved to a type-only `.d.ts`, so it bundled fine and threw at
 * module load. This bundles a tiny entry that evaluates shared Zod schemas, and
 * runs it. RN core init and polyfills are dropped so plain Node is enough —
 * nothing here touches native modules.
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
