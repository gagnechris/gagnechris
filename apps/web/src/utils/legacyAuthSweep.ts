const PREFIX = 'CognitoIdentityServiceProvider.';

/**
 * The old apex admin app left Cognito tokens in this origin's localStorage,
 * and possibly in cookies on `Domain=<apex>`, where every public-page script
 * can read them. Nothing on the public site signs in, so any such key is stale.
 */
export function sweepLegacyAuth(
  doc: Document = document,
  storage: Storage = window.localStorage,
): void {
  for (const pair of doc.cookie.split(';')) {
    const name = pair.split('=', 1)[0]!.trim();
    if (!name.startsWith(PREFIX)) continue;
    const expired = `${name}=; Max-Age=0; Path=/`;
    doc.cookie = `${expired}; Domain=${doc.location.hostname}`;
    doc.cookie = expired;
  }
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
}
