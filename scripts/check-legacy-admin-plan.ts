/**
 * The apex keeps serving the last legacy admin build (`spa.html`) for /admin*
 * and /auth* until the cutover. That shell loads hashed /assets/* chunks and
 * the PWA files from earlier deploys, so the apex sync must never delete any
 * of them or overwrite `spa.html`.
 *
 * Walks everything the legacy shell can load (HTML, JS imports, CSS urls,
 * manifest icons) and checks it against an `aws s3 sync --dryrun` plan.
 *
 * Usage:
 *   npx tsx scripts/check-legacy-admin-plan.ts --plan <dryrun.txt> --bucket <name>
 *   npx tsx scripts/check-legacy-admin-plan.ts --plan <dryrun.txt> --bucket <name> --dir <local mirror>
 *   npx tsx scripts/check-legacy-admin-plan.ts --origin https://gagnechris.com
 *   (--origin lists what the live shell loads; it has no plan to check.)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  S3Client,
} from '@aws-sdk/client-s3';

export const LEGACY_SHELL_KEY = 'spa.html';

export interface ObjectSource {
  /** Object body, or null when the key doesn't exist. */
  read(key: string): Promise<string | null>;
  exists(key: string): Promise<boolean>;
}

const TEXT_KEY = /\.(?:html|js|mjs|css|json)$/;
const HTML_REF = /\b(?:src|href)=["'](\/[^"'#?]*)/g;
const CSS_REF = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;
const ASSET_FILE = String.raw`[\w.-]+\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpe?g|gif|webp|avif|ico)`;
// Vite chunks import siblings as "./x-hash.js" and list preloads as "assets/x-hash.js".
const JS_REF = new RegExp(
  String.raw`["'\`](\.\/|\/?assets\/)(${ASSET_FILE})["'\`]`,
  'g',
);

function resolveRef(fromKey: string, ref: string): string | null {
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(ref) ||
    ref.startsWith('//') ||
    ref.startsWith('data:')
  ) {
    return null;
  }
  const clean = ref.split(/[?#]/)[0]!;
  if (!clean) return null;
  const resolved = clean.startsWith('/')
    ? clean.slice(1)
    : posix.normalize(posix.join(posix.dirname(fromKey), clean));
  return resolved && !resolved.startsWith('..') ? decodeURI(resolved) : null;
}

export function referencesIn(key: string, body: string): string[] {
  const refs = new Set<string>();
  const add = (ref: string | null) => {
    if (ref && ref !== key) refs.add(ref);
  };
  if (key.endsWith('.html')) {
    for (const m of body.matchAll(HTML_REF)) add(resolveRef(key, m[1]!));
  } else if (key.endsWith('.css')) {
    for (const m of body.matchAll(CSS_REF)) add(resolveRef(key, m[2]!));
  } else if (key.endsWith('.js') || key.endsWith('.mjs')) {
    for (const m of body.matchAll(JS_REF)) {
      add(m[1] === './' ? resolveRef(key, `./${m[2]}`) : `assets/${m[2]}`);
    }
  } else if (key.endsWith('.json')) {
    try {
      const parsed = JSON.parse(body) as { icons?: { src?: unknown }[] };
      for (const icon of parsed.icons ?? []) {
        if (typeof icon.src === 'string') add(resolveRef(key, icon.src));
      }
    } catch {
      // Not a manifest.
    }
  }
  return [...refs];
}

/** Every key the legacy shell loads, and the ones that are already missing. */
export async function legacyShellGraph(
  source: ObjectSource,
): Promise<{ keys: Set<string>; missing: string[] }> {
  const keys = new Set<string>([LEGACY_SHELL_KEY]);
  const missing: string[] = [];
  const queue = [LEGACY_SHELL_KEY];
  while (queue.length > 0) {
    const batch = queue.splice(0, 16);
    await Promise.all(
      batch.map(async (key) => {
        if (!TEXT_KEY.test(key)) {
          if (!(await source.exists(key))) missing.push(key);
          return;
        }
        const body = await source.read(key);
        if (body === null) {
          missing.push(key);
          return;
        }
        for (const ref of referencesIn(key, body)) {
          if (!keys.has(ref)) {
            keys.add(ref);
            queue.push(ref);
          }
        }
      }),
    );
  }
  return { keys, missing: missing.sort() };
}

export interface SyncPlan {
  uploads: Set<string>;
  deletes: Set<string>;
}

/** Parses `aws s3 sync --dryrun` output for one bucket. */
export function parseSyncPlan(output: string, bucket: string): SyncPlan {
  const target = `s3://${bucket}/`;
  const plan: SyncPlan = { uploads: new Set(), deletes: new Set() };
  for (const line of output.split('\n')) {
    const m = /^\(dryrun\) (upload|delete|copy|move): (.*)$/.exec(line.trim());
    if (!m) continue;
    const at = m[2]!.lastIndexOf(target);
    if (at === -1) continue;
    const key = m[2]!.slice(at + target.length);
    if (m[1] === 'delete') plan.deletes.add(key);
    else plan.uploads.add(key);
  }
  return plan;
}

export function planProblems(
  graph: { keys: Set<string>; missing: string[] },
  plan: SyncPlan,
): string[] {
  const problems = graph.missing.map(
    (key) => `${key} is already missing from the bucket`,
  );
  for (const key of [...graph.keys].sort()) {
    if (plan.deletes.has(key)) problems.push(`the sync would delete ${key}`);
  }
  if (plan.uploads.has(LEGACY_SHELL_KEY)) {
    problems.push(`the sync would overwrite ${LEGACY_SHELL_KEY}`);
  }
  return problems;
}

export function dirSource(root: string): ObjectSource {
  const path = (key: string) => join(root, ...key.split('/'));
  return {
    async read(key) {
      return existsSync(path(key)) ? readFileSync(path(key), 'utf8') : null;
    },
    async exists(key) {
      return existsSync(path(key));
    },
  };
}

function s3Source(bucket: string): ObjectSource {
  const client = new S3Client({
    region:
      process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
  });
  return {
    async read(key) {
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        return (await res.Body?.transformToString('utf8')) ?? '';
      } catch (err) {
        if (err instanceof NoSuchKey) return null;
        throw err;
      }
    },
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (err) {
        if (err instanceof NotFound || err instanceof NoSuchKey) return false;
        throw err;
      }
    },
  };
}

function originSource(origin: string): ObjectSource {
  const url = (key: string) => `${origin.replace(/\/$/, '')}/${key}`;
  return {
    async read(key) {
      const res = await fetch(url(key));
      return res.ok ? res.text() : null;
    },
    async exists(key) {
      return (await fetch(url(key), { method: 'HEAD' })).ok;
    },
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const bucket = arg('bucket');
  const dir = arg('dir');
  const origin = arg('origin');
  const planFile = arg('plan');

  if (origin) {
    const graph = await legacyShellGraph(originSource(origin));
    console.log([...graph.keys].sort().join('\n'));
    if (graph.missing.length > 0) {
      console.error(`Missing on ${origin}:\n  ${graph.missing.join('\n  ')}`);
      process.exit(1);
    }
    return;
  }
  if (!planFile || !bucket) {
    console.error(
      'Usage: check-legacy-admin-plan.ts --plan <dryrun.txt> --bucket <name> [--dir <local mirror>]',
    );
    process.exit(2);
  }

  const source = dir ? dirSource(dir) : s3Source(bucket);
  const graph = await legacyShellGraph(source);
  const plan = parseSyncPlan(readFileSync(planFile, 'utf8'), bucket);
  const problems = planProblems(graph, plan);
  if (problems.length > 0) {
    console.error(
      `Refusing the apex sync: the legacy /admin shell would break.\n  ${problems.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(
    `Legacy /admin shell intact: ${graph.keys.size} referenced files present, none deleted by the sync, ${LEGACY_SHELL_KEY} not overwritten.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
