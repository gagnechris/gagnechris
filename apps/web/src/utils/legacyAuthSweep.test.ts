import { afterEach, describe, expect, it } from 'vitest';
import { sweepLegacyAuth } from './legacyAuthSweep';

const CLIENT = '3kbdi3gk4bngftgo0useo980nb';
const TOKEN_KEYS = [
  `CognitoIdentityServiceProvider.${CLIENT}.LastAuthUser`,
  `CognitoIdentityServiceProvider.${CLIENT}.owner.idToken`,
  `CognitoIdentityServiceProvider.${CLIENT}.owner.refreshToken`,
  `CognitoIdentityServiceProvider.${CLIENT}.inflightOAuth`,
];

/** Records every cookie write; reads return the jar given. */
function fakeDocument(hostname: string, jar: string) {
  const writes: string[] = [];
  const doc = {
    location: { hostname },
    get cookie() {
      return jar;
    },
    set cookie(value: string) {
      writes.push(value);
    },
  } as unknown as Document;
  return { doc, writes };
}

afterEach(() => {
  window.localStorage.clear();
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=', 1)[0]!.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
});

describe('sweepLegacyAuth', () => {
  it('removes every Cognito key from localStorage and keeps the rest', () => {
    for (const key of TOKEN_KEYS) window.localStorage.setItem(key, 'eyJx');
    window.localStorage.setItem('theme', 'dark');
    window.localStorage.setItem('xCognitoIdentityServiceProvider.a', 'keep');

    sweepLegacyAuth();

    expect(Object.keys(window.localStorage).sort()).toEqual([
      'theme',
      'xCognitoIdentityServiceProvider.a',
    ]);
  });

  it('expires Cognito cookies on the apex domain and host-only', () => {
    const { doc, writes } = fakeDocument(
      'gagnechris.com',
      `_ga=GA1.1; CognitoIdentityServiceProvider.${CLIENT}.owner.idToken=eyJx; CognitoIdentityServiceProvider.${CLIENT}.LastAuthUser=owner`,
    );

    sweepLegacyAuth(doc, window.localStorage);

    expect(writes).toEqual([
      `CognitoIdentityServiceProvider.${CLIENT}.owner.idToken=; Max-Age=0; Path=/; Domain=gagnechris.com`,
      `CognitoIdentityServiceProvider.${CLIENT}.owner.idToken=; Max-Age=0; Path=/`,
      `CognitoIdentityServiceProvider.${CLIENT}.LastAuthUser=; Max-Age=0; Path=/; Domain=gagnechris.com`,
      `CognitoIdentityServiceProvider.${CLIENT}.LastAuthUser=; Max-Age=0; Path=/`,
    ]);
  });

  it('clears a real host-only cookie and leaves other cookies', () => {
    document.cookie = `CognitoIdentityServiceProvider.${CLIENT}.owner.accessToken=eyJx; Path=/`;
    document.cookie = 'consent=yes; Path=/';

    sweepLegacyAuth();

    expect(document.cookie).toBe('consent=yes');
  });

  it('does nothing when there is nothing to sweep', () => {
    const { doc, writes } = fakeDocument('gagnechris.com', '');
    window.localStorage.setItem('theme', 'dark');

    sweepLegacyAuth(doc, window.localStorage);

    expect(writes).toEqual([]);
    expect(Object.keys(window.localStorage)).toEqual(['theme']);
  });
});
