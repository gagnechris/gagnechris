import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type LockEntry = {
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

export type Lockfile = { packages: Record<string, LockEntry> };

type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** The packages Metro bundles from source for iOS while root vitest tests them. */
export const MOBILE_SOURCE_PACKAGES = [
  'packages/shared',
  'packages/api-client',
  'packages/app-core',
  'packages/tokens',
] as const;

const NESTED = '/node_modules/';

/** Node's lookup: the nearest `node_modules/<name>` above `from`, as the lockfile lays it out. */
function resolve(lock: Lockfile, from: string, name: string): string | null {
  let dir = from;
  for (;;) {
    const candidate = dir
      ? `${dir}/node_modules/${name}`
      : `node_modules/${name}`;
    if (lock.packages[candidate]) return candidate;
    if (!dir) return null;
    const cut = dir.lastIndexOf(NESTED);
    dir = cut === -1 ? '' : dir.slice(0, cut);
  }
}

function requiredDeps(entry: LockEntry | Manifest): string[] {
  const optional =
    'peerDependenciesMeta' in entry ? entry.peerDependenciesMeta : undefined;
  return [
    ...Object.keys(entry.dependencies ?? {}),
    ...Object.keys(entry.peerDependencies ?? {}).filter(
      (name) => !optional?.[name]?.optional,
    ),
  ].filter((name) => !name.startsWith('@gagnechris/'));
}

/**
 * Every runtime dependency (and its dependencies) of the given workspace
 * packages must have one version in both lockfiles: Metro resolves them from
 * apps/mobile/node_modules only, while the root tests use the root install.
 * `webOnly` picks out deps the RN bundle guard keeps out of the app, which
 * the mobile lockfile need not hold.
 */
export function lockfileParityErrors(
  rootLock: Lockfile,
  mobileLock: Lockfile,
  manifests: readonly { dir: string; manifest: Manifest }[],
  webOnly: (name: string) => boolean,
): string[] {
  const errors = new Set<string>();
  const seen = new Set<string>();
  const queue: {
    name: string;
    rootPath: string;
    mobilePath: string;
    via: string;
  }[] = [];

  for (const { dir, manifest } of manifests) {
    for (const name of requiredDeps(manifest)) {
      const rootPath = resolve(rootLock, dir, name);
      const mobilePath = mobileLock.packages[`node_modules/${name}`]
        ? `node_modules/${name}`
        : null;
      if (!rootPath) {
        errors.add(`${manifest.name}: ${name} is not in the root lockfile`);
        continue;
      }
      if (!mobilePath) {
        if (!webOnly(name)) {
          errors.add(
            `${manifest.name}: ${name} is not in apps/mobile/package-lock.json`,
          );
        }
        continue;
      }
      queue.push({ name, rootPath, mobilePath, via: manifest.name });
    }
  }

  while (queue.length > 0) {
    const { name, rootPath, mobilePath, via } = queue.shift()!;
    const key = `${rootPath}|${mobilePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rootEntry = rootLock.packages[rootPath]!;
    const mobileEntry = mobileLock.packages[mobilePath]!;
    if (rootEntry.version !== mobileEntry.version) {
      errors.add(
        `${name} (via ${via}): ${rootEntry.version} in the root lockfile, ${mobileEntry.version} in apps/mobile`,
      );
      continue;
    }
    for (const dep of requiredDeps(rootEntry)) {
      const nextRoot = resolve(rootLock, rootPath, dep);
      const nextMobile = resolve(mobileLock, mobilePath, dep);
      if (!nextRoot || !nextMobile) {
        if (nextRoot !== nextMobile) {
          errors.add(
            `${dep} (via ${name}): only in the ${nextRoot ? 'root' : 'apps/mobile'} lockfile`,
          );
        }
        continue;
      }
      queue.push({
        name: dep,
        rootPath: nextRoot,
        mobilePath: nextMobile,
        via: name,
      });
    }
  }
  return [...errors];
}

export function repoLockfileParityErrors(
  repoRoot: string,
  webOnly: (name: string) => boolean,
): string[] {
  const read = <T>(path: string): T =>
    JSON.parse(readFileSync(join(repoRoot, path), 'utf8')) as T;
  return lockfileParityErrors(
    read<Lockfile>('package-lock.json'),
    read<Lockfile>('apps/mobile/package-lock.json'),
    MOBILE_SOURCE_PACKAGES.map((dir) => ({
      dir,
      manifest: read<Manifest>(`${dir}/package.json`),
    })),
    webOnly,
  );
}
