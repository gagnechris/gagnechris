import { definePublishTarget } from '../../src/publish-targets/registry.js';
import type { PublishTarget } from '../../src/publish-targets/types.js';

/** Demo-only target: adding a page is this file alone (loaded by registry test). */
const target: PublishTarget = {
  id: 'ac-demo-publish',
  matches(scope) {
    return scope.home;
  },
  needsCatalog: () => false,
  needsShell: () => false,
  async run() {
    return {};
  },
};

definePublishTarget(target);

export default target;
