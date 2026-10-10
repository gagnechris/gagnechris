// What the local stack adds around the API that prod gets from AWS: the
// site bucket's CORS rule for media PUTs and the publisher's stream trigger.
// Whichever process faces the browser runs them, once.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isPublishRelevantAdminMutation } from '@gagnechris/data';
import { rebuildPublishedSite } from '@gagnechris/publisher/rebuild';

// Local upload URLs point at the API, so the browser PUT is cross-origin like
// the prod PUT to the site bucket, which allows it with a CORS rule.
const MEDIA_OBJECTS_PREFIX = '/api/admin/media/objects/';

// Returns true when it answered the request (a preflight).
export function mediaCors(req: IncomingMessage, res: ServerResponse): boolean {
  if (!(req.url || '').startsWith(MEDIA_OBJECTS_PREFIX)) return false;
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method !== 'OPTIONS') return false;
  res.statusCode = 204;
  res.end();
  return true;
}

// One rebuild at a time: a rebuild that read the table before a publish can
// then never write after the rebuild that has it, so once a publish responds
// the site keeps the item until something else changes it.
let rebuilds: Promise<void> = Promise.resolve();

export async function maybeRebuild(
  method: string,
  path: string,
  status: number,
) {
  if (status < 200 || status >= 300) return;
  // Local stand-in for stream filter Keys.sk == PUBLISHED (see isPublishRelevant).
  if (!isPublishRelevantAdminMutation(method, path)) {
    return;
  }
  rebuilds = rebuilds.then(async () => {
    try {
      const result = await rebuildPublishedSite();
      console.info('[local-api] publisher rebuild', result);
    } catch (err) {
      console.error('[local-api] publisher rebuild failed', err);
    }
  });
  await rebuilds;
}
