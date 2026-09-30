/**
 * AC demo target (CHR-157): a real new page (`now/index.html`) owned entirely
 * by this file. Production registry is unchanged; tests append this target to
 * the explicit `publishTargets` array (one registry entry, no rebuild-scope edits).
 */
import type { PublishTarget } from '../../src/publish-targets/types.js';
import { CACHE_HTML } from '../../src/publish-targets/types.js';

const NOW_HTML = `<!doctype html>
<html lang="en">
  <head><title>Now - Chris Gagne</title></head>
  <body><main><h1>Now</h1></main></body>
</html>
`;

const target: PublishTarget = {
  id: 'now-page',
  matches(scope) {
    // Piggyback on full rebuild / home without a new RebuildScope boolean.
    return scope.home;
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
