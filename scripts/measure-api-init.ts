/**
 * Median time to load the API Lambda bundle in a fresh Node process, with and
 * without `--enable-source-maps`. Builds with the CDK bundling options.
 *
 *   npx tsx scripts/measure-api-init.ts            # local Node, 20 runs per variant
 *   npx tsx scripts/measure-api-init.ts --runs 40 --docker --cpus 0.58
 *
 * `--docker` runs inside the Lambda Node.js 24 image (its bundled AWS SDK);
 * `--cpus 0.58` is roughly the CPU share of a 1024 MB function.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildSync } from 'esbuild';

const LAMBDA_IMAGE = 'public.ecr.aws/lambda/nodejs:24';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '20' },
    docker: { type: 'boolean', default: false },
    cpus: { type: 'string', default: '0.58' },
  },
});
const runs = Number(values.runs);

const dir = mkdtempSync(join(tmpdir(), 'api-init-'));
buildSync({
  entryPoints: [join(repoRoot, 'services/api/src/handler.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  minify: true,
  sourcemap: true,
  external: ['@aws-sdk/*'],
  outfile: join(dir, 'index.js'),
  logLevel: 'warning',
});

// Prints "<variant> <require ms> <process start to loaded ms>" per run.
const probe = `
const t = performance.now();
require(process.argv[2]);
const done = performance.now();
console.log(process.env.VARIANT, (done - t).toFixed(2), done.toFixed(2));
`;
writeFileSync(join(dir, 'probe.cjs'), probe);
const loop = `
for i in $(seq ${runs}); do
  VARIANT=none node "$DIR/probe.cjs" "$DIR/index.js"
  VARIANT=source-maps node --enable-source-maps "$DIR/probe.cjs" "$DIR/index.js"
done
`;
writeFileSync(join(dir, 'loop.sh'), loop);

try {
  const out = values.docker
    ? execFileSync(
        'docker',
        [
          'run',
          '--rm',
          `--cpus=${values.cpus}`,
          '--memory=1024m',
          '-v',
          `${dir}:/m:ro`,
          '-e',
          'DIR=/m',
          '-e',
          'NODE_PATH=/var/runtime/node_modules',
          '--entrypoint',
          'bash',
          LAMBDA_IMAGE,
          '/m/loop.sh',
        ],
        { encoding: 'utf8' },
      )
    : execFileSync('bash', [join(dir, 'loop.sh')], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DIR: dir,
          NODE_OPTIONS: '',
          NODE_PATH: join(repoRoot, 'node_modules'),
        },
      });

  const samples = new Map<string, { load: number[]; total: number[] }>();
  for (const line of out.trim().split('\n')) {
    const [variant, load, total] = line.split(' ');
    const s = samples.get(variant!) ?? { load: [], total: [] };
    s.load.push(Number(load));
    s.total.push(Number(total));
    samples.set(variant!, s);
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  };
  const where = values.docker
    ? `${LAMBDA_IMAGE}, --cpus=${values.cpus}`
    : `local ${process.version}`;
  console.log(`${runs} fresh processes per variant (${where})`);
  for (const [variant, s] of samples) {
    console.log(
      `${variant.padEnd(12)} require p50 ${median(s.load).toFixed(1)} ms, process start to loaded p50 ${median(s.total).toFixed(1)} ms`,
    );
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
