/** Schemes the markdown sanitizer keeps on `<a href>` in post bodies. */
export const POST_LINK_SCHEMES = ['http', 'https', 'mailto', 'tel'] as const;

export const PROJECT_HREF_SCHEMES = ['https'] as const;

export const LINK_HREF_MAX_LENGTH = 2048;

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS_RE = /[\s\u0000-\u001f\u007f\\]/;

/**
 * A site-relative path (`/x`, never protocol-relative `//host`) or a URL
 * whose scheme is in `schemes`. Regex only, so it runs on React Native.
 */
export const isSafeLinkHref = (
  value: string,
  schemes: readonly string[],
): boolean => {
  if (!value || value.length > LINK_HREF_MAX_LENGTH) return false;
  if (UNSAFE_CHARS_RE.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  const match = SCHEME_RE.exec(value);
  if (!match) return false;
  const scheme = match[1]!.toLowerCase();
  if (!schemes.includes(scheme)) return false;
  const rest = value.slice(match[0].length);
  if (scheme === 'http' || scheme === 'https') {
    // A userinfo part (`https://site.com@evil.example`) hides the real host.
    const authority = /^\/\/([^/?#]+)/.exec(rest)?.[1];
    return authority !== undefined && !authority.includes('@');
  }
  return rest.length > 0;
};
