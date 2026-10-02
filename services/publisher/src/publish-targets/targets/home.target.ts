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
    const lookup = await sources.getPublishedHome();
    if (lookup.status === 'ok') {
      const home = lookup.entity;
      return {
        artifacts: [
          {
            key: 'index.html',
            body: renderHomePage(shell, home),
            contentType: 'text/html; charset=utf-8',
            cacheControl: CACHE_HTML,
          },
          {
            key: HOME_LAST_PUBLISHED_KEY,
            body: JSON.stringify(homeToSnapshot(home)),
            contentType: 'application/json; charset=utf-8',
            cacheControl: CACHE_HTML,
          },
        ],
        invalidationPaths: ['/', '/index.html'],
        homePublished: true,
      };
    }
    // missing or corrupt: restore last published snapshot when present (CHR-103 / CHR-160).
    const snapshot = await readHomePublishSnapshot(storage);
    if (snapshot) {
      return {
        artifacts: [
          {
            key: 'index.html',
            body: renderHomePage(shell, snapshotToHome(snapshot)),
            contentType: 'text/html; charset=utf-8',
            cacheControl: CACHE_HTML,
          },
        ],
        invalidationPaths: ['/', '/index.html'],
        homeRestoredFromSnapshot: true,
      };
    }
    return {};
  },
};

export default target;
