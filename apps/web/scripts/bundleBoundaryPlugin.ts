import type { Plugin } from 'vite';

/**
 * Signed-in code, auth and the query stack that must never ship on the public
 * site. Matched against Rollup module IDs (real paths, so symlinked workspace
 * packages resolve under packages/).
 */
export const PUBLIC_FORBIDDEN_MODULES: readonly RegExp[] = [
  /\/apps\/web\/src\/(?:admin|notebook|workspace|auth)\//,
  /\/node_modules\/(?:aws-amplify|@aws-amplify)\//,
  /\/packages\/app-core\//,
  /\/node_modules\/@gagnechris\/app-core\//,
  /\/node_modules\/@tanstack\/react-query\//,
];

const normalize = (id: string) => id.replace(/\\/g, '/').replace(/^\0/, '');

/** Fails the build if any emitted chunk contains a forbidden module. */
export function bundleBoundaryPlugin(
  forbidden: readonly RegExp[] = PUBLIC_FORBIDDEN_MODULES,
): Plugin {
  return {
    name: 'bundle-boundary',
    apply: 'build',
    generateBundle(_options, bundle) {
      const offenders = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of output.moduleIds) {
          const path = normalize(id);
          if (forbidden.some((re) => re.test(path))) {
            offenders.add(`${path} (in ${output.fileName})`);
          }
        }
      }
      if (offenders.size > 0) {
        this.error(
          `Public bundle contains signed-in or auth modules:\n  ${[...offenders].sort().join('\n  ')}`,
        );
      }
    },
  };
}
