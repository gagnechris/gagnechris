import type { PublishTarget } from '../types.js';

/** Never matches in production; proves glob registration of new `*.target.ts` files. */
const target: PublishTarget = {
  id: 'registry-self-test',
  matches: () => false,
  needsCatalog: () => false,
  needsShell: () => false,
  async run() {
    return {};
  },
};

export default target;
