import {
  discardHome,
  fetchHome,
  publishHome,
  unpublishHome,
  updateHome,
  type Home,
  type UpdateHomeRequest,
} from './api.js';
import { setCachedHome } from './cache.js';
import { createDraftPublishResource } from './createDraftPublishResource.js';
import { queryKeys } from './keys.js';
import { siteTooLargeMessage } from './tooLarge.js';

export type HomeResourceParams = Record<string, never>;

export const homeResource = createDraftPublishResource<
  Home,
  HomeResourceParams
>({
  queryKey: () => queryKeys.home(),
  fetch: (client) => fetchHome(client),
  update: (client, _params, body) =>
    updateHome(client, body as UpdateHomeRequest),
  publish: (client, _params, body) => publishHome(client, body),
  unpublish: (client, _params, body) => unpublishHome(client, body),
  discard: (client, _params, body) => discardHome(client, body),
  setCache: setCachedHome,
  tooLargeMessage: siteTooLargeMessage('the home page'),
});
