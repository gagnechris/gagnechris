import type { SessionUser } from '../session';

export type IdTokenClaims = {
  sub: string;
  exp: number;
  email?: string;
  name?: string;
  'cognito:groups'?: string[];
};

function base64UrlDecode(part: string): string {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  // Percent-encoding the bytes lets decodeURIComponent do the UTF-8 decode;
  // Hermes has atob but not every release has TextDecoder.
  const binary = atob(padded);
  let encoded = '';
  for (let i = 0; i < binary.length; i += 1) {
    encoded += `%${binary.charCodeAt(i).toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(encoded);
}

/** Reads the payload only: the API verifies the signature, the app just needs who and which groups. */
export function decodeIdToken(token: string): IdTokenClaims | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(base64UrlDecode(payload));
    if (
      claims &&
      typeof claims === 'object' &&
      'sub' in claims &&
      typeof claims.sub === 'string' &&
      'exp' in claims &&
      typeof claims.exp === 'number'
    ) {
      return claims as IdTokenClaims;
    }
  } catch {
    // Not a JWT.
  }
  return null;
}

export function userFromClaims(claims: IdTokenClaims): SessionUser {
  const groups = claims['cognito:groups'];
  return {
    sub: claims.sub,
    email: claims.email ?? '',
    name: claims.name?.trim() || null,
    groups: Array.isArray(groups)
      ? groups.filter((g) => typeof g === 'string')
      : [],
  };
}
