import { describe, expect, it, vi } from 'vitest';
import { cognitoConfig, IOS_AUTH_REDIRECTS } from '../config';
import { addPasskey, addPasskeyUrl, renewManagedLoginUrl } from './passkey';

const config = {
  ...cognitoConfig,
  clientId: 'ios-client',
  ...IOS_AUTH_REDIRECTS.universalLink,
  ephemeralSession: false,
};
const CALLBACK = 'https://notebook.gagnechris.com/ios/auth/callback';
const ADD = addPasskeyUrl(config);
const RENEW = renewManagedLoginUrl(config);

const sheets = (...urls: (string | null)[]) => {
  const open = vi.fn();
  for (const url of urls) {
    open.mockResolvedValueOnce(
      url === null ? { type: 'cancel' } : { type: 'success', url },
    );
  }
  return open;
};

describe('addPasskeyUrl', () => {
  it("opens managed login's add-passkey page, back to the app's https callback", () => {
    expect(ADD).toBe(
      'https://auth.gagnechris.com/passkeys/add?client_id=ios-client&redirect_uri=https%3A%2F%2Fnotebook.gagnechris.com%2Fios%2Fauth%2Fcallback',
    );
  });

  it('renews the managed-login session with a fresh sign-in', () => {
    const url = new URL(RENEW);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://auth.gagnechris.com/oauth2/authorize',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'ios-client',
      redirect_uri: CALLBACK,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'login',
    });
  });
});

describe('addPasskey', () => {
  it('opens the passkey page once while the session is live', async () => {
    const open = sheets(`${CALLBACK}?result=success`);
    expect(await addPasskey(config, open)).toBe('done');
    expect(open.mock.calls.map(([url]) => url)).toEqual([ADD]);
    expect(open.mock.calls[0]![2]).toEqual({
      preferEphemeralSession: false,
      preferUniversalLinks: true,
    });
  });

  it('signs in once when the page finds no session, then reopens it', async () => {
    const open = sheets(
      `${CALLBACK}?result=invalid_session`,
      `${CALLBACK}?code=abc`,
      `${CALLBACK}?result=success`,
    );
    expect(await addPasskey(config, open)).toBe('done');
    expect(open.mock.calls.map(([url]) => url)).toEqual([ADD, RENEW, ADD]);
  });

  it('fails instead of looping when signing in still leaves no session', async () => {
    const open = sheets(
      `${CALLBACK}?result=invalid_session`,
      `${CALLBACK}?code=abc`,
      `${CALLBACK}?result=invalid_session`,
    );
    expect(await addPasskey(config, open)).toBe('failed');
    expect(open).toHaveBeenCalledTimes(3);
  });

  it('stops when the user closes the sign-in sheet', async () => {
    const open = sheets(`${CALLBACK}?result=invalid_session`, null);
    expect(await addPasskey(config, open)).toBe('cancelled');
    expect(open).toHaveBeenCalledTimes(2);
  });
});
