import type { ApiClient } from '@gagnechris/api-client';
import { CLIENT_VERSION_HEADER } from '@gagnechris/shared';
import appJson from '../../app.json';

export const CLIENT_VERSION = appJson.expo.version;

/** The API refuses the sync feed below its minimum version with a 426. */
export const sendClientVersion = (client: ApiClient): ApiClient => {
  client.use({
    onRequest({ request }) {
      request.headers.set(CLIENT_VERSION_HEADER, CLIENT_VERSION);
      return request;
    },
  });
  return client;
};
