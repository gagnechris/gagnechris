/**
 * AC demo target (CHR-157 / CHR-166): a real new page (`now/index.html`) owned
 * entirely by this file. Production registry is unchanged; tests append this
 * target to the explicit `publishTargets` array.
 *
 * Matches via `touchedEntityTypes` (own Dynamo entity trigger) or a full
 * rebuild — no new RebuildScope boolean / rebuild-scope.ts edit required.
 */
import { isFullRebuildScope } from '../../src/rebuild-scope.js';
import type { PublishTarget } from '../../src/publish-targets/types.js';
import { CACHE_HTML } from '../../src/publish-targets/types.js';

const NOW_ENTITY = 'now';

const NOW_HTML = `<!doctype html>
<html lang="en">
  <head><title>Now - Chris Gagne</title></head>
  <body><main><h1>Now</h1></main></body>
</html>
`;

const target: PublishTarget = {
  id: 'now-page',
  optionBPaths: ['/now'],
  adminMutationPrefixes: ['/api/admin/now'],
  matches(scope) {
    return (
      scope.touchedEntityTypes.has(NOW_ENTITY) || isFullRebuildScope(scope)
    );
  },
  needsCatalog: () => false,
  needsShell: () => false,
  async run() {
    return {
      artifacts: [
        {
          key: 'now/index.html',
          body: NOW_HTML,
          contentType: 'text/html; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
      ],
      invalidationPaths: ['/now*'],
    };
  },
};

export default target;
