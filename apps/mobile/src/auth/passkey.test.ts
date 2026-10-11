import { describe, expect, it } from 'vitest';
import { cognitoConfig, IOS_AUTH_REDIRECTS } from '../config';
import { addPasskeyUrl } from './passkey';

describe('addPasskeyUrl', () => {
  it("opens managed login's add-passkey page, back to the app's https callback", () => {
    expect(
      addPasskeyUrl({
        ...cognitoConfig,
        clientId: 'ios-client',
        ...IOS_AUTH_REDIRECTS.universalLink,
      }),
    ).toBe(
      'https://auth.gagnechris.com/passkeys/add?client_id=ios-client&redirect_uri=https%3A%2F%2Fnotebook.gagnechris.com%2Fios%2Fauth%2Fcallback',
    );
  });
});
