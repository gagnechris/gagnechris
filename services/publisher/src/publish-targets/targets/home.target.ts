import {
  HOME_LAST_PUBLISHED_KEY,
  homeToSnapshot,
  readHomePublishSnapshot,
  snapshotToHome,
} from '../../home-publish.js';
import { renderHomePage } from '../../render.js';
import type { PublishTarget } from '../types.js';
import { CACHE_HTML } from '../types.js';

const target: PublishTarget = {
  id: 'home',
  matches(scope) {
    return scope.home;
  },
  needsCatalog() {
    return false;
  },
  needsShell() {
    return true;
  },
  async run(ctx) {
    const { shell, storage, sources } = ctx;
    const home = await sources.getPublishedHome();
    if (home) {
      await storage.put(
        'index.html',
        renderHomePage(shell, home),
        'text/html; charset=utf-8',
        CACHE_HTML,
      );
      await storage.put(
        HOME_LAST_PUBLISHED_KEY,
        JSON.stringify(homeToSnapshot(home)),
        'application/json; charset=utf-8',
        CACHE_HTML,
      );
      return { homePublished: true };
    }
    const snapshot = await readHomePublishSnapshot(storage);
    if (snapshot) {
      await storage.put(
        'index.html',
        renderHomePage(shell, snapshotToHome(snapshot)),
        'text/html; charset=utf-8',
        CACHE_HTML,
      );
      return { homeRestoredFromSnapshot: true };
    }
    return {};
  },
};

export default target;
