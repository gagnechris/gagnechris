const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Monorepo Metro config (CHR-142).
 * - Watch the workspace root so packages/* hot-reload
 * - Prefer workspace node_modules (single React copy via root overrides)
 * - Resolve NodeNext-style `.js` specifiers to `.ts` / `.tsx` source files
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

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    const candidates = [
      moduleName.slice(0, -3) + '.ts',
      moduleName.slice(0, -3) + '.tsx',
      moduleName.slice(0, -3) + '.d.ts',
    ];
    for (const candidate of candidates) {
      try {
        return context.resolveRequest(context, candidate, platform);
      } catch {
        // try next extension
      }
    }
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
