const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Monorepo Metro config (CHR-142, fixed in CHR-150).
 * - Watch the workspace root so packages/* hot-reload
 * - Resolve node_modules from this app first, then the workspace root, so the
 *   Expo-pinned React wins over the root copy (the two are kept on the same
 *   version; see docs/mobile.md)
 * - Resolve NodeNext-style `.js` specifiers to `.ts` / `.tsx` source files,
 *   but only for first-party code
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enablePackageExports = true;

/** Roots whose TypeScript sources Metro compiles directly (no build step). */
const firstPartyRoots = [
  path.join(projectRoot, path.sep),
  path.join(workspaceRoot, 'packages', path.sep),
];

const isFirstParty = (originModulePath) =>
  typeof originModulePath === 'string' &&
  !originModulePath.includes(`${path.sep}node_modules${path.sep}`) &&
  firstPartyRoots.some((root) => originModulePath.startsWith(root));

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Our packages use NodeNext `./foo.js` specifiers that only exist as `.ts`.
  // Scope the remap to relative imports from first-party files: a blanket
  // remap also rewrites node_modules imports, and a package that ships
  // `foo.js` beside `foo.d.ts` (zod) then resolves to the type-only
  // declaration, which has no runtime and crashes on import (CHR-150).
  if (
    moduleName.startsWith('.') &&
    moduleName.endsWith('.js') &&
    isFirstParty(context.originModulePath)
  ) {
    const base = moduleName.slice(0, -3);
    for (const candidate of [`${base}.ts`, `${base}.tsx`]) {
      try {
        return context.resolveRequest(context, candidate, platform);
      } catch {
        // No such source file — fall through to the specifier as written.
      }
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
