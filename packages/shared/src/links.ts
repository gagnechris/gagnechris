/** Schemes the markdown sanitizer keeps on `<a href>` in post bodies. */
export const POST_LINK_SCHEMES = ['http', 'https', 'mailto', 'tel'] as const;

export const PROJECT_HREF_SCHEMES = ['https'] as const;

export const LINK_HREF_MAX_LENGTH = 2048;

/** A path on this site; `//host` is protocol-relative, so it is off-site. */
export const isSitePath = (href: string): boolean =>
  href.startsWith('/') && !href.startsWith('//');

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
  if (value.startsWith('/')) return isSitePath(value);
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

export type BareUrl = { from: number; to: number; href: string };

// Emphasis markers may sit right before a URL, as in GFM autolinks.
const BARE_URL =
  /(?<![A-Za-z0-9.+\-/@])(?:https?:\/\/[^\s<>"'`|[\]./]|www\.[A-Za-z0-9-])[^\s<>"`|[\]]*/gi;
const TRAILING_PUNCTUATION = /[?!.,:;*_~'"]$/;

const unbalancedClose = (url: string) =>
  url.endsWith(')') && url.split(')').length > url.split('(').length;

/** Sentence punctuation, emphasis markers and an unbalanced `)` aren't part of a URL. */
function trimUrl(url: string): string {
  let out = url;
  while (TRAILING_PUNCTUATION.test(out) || unbalancedClose(out)) {
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * `http(s)://` and `www.` URLs in plain text, as GFM autolinks them; a
 * `www.` URL links to https. Regex only, so it runs on React Native.
 */
export function findBareUrls(text: string): BareUrl[] {
  const out: BareUrl[] = [];
  for (const m of text.matchAll(BARE_URL)) {
    const url = trimUrl(m[0]);
    if (url.endsWith('//')) continue;
    out.push({
      from: m.index,
      to: m.index + url.length,
      href: /^www\./i.test(url) ? `https://${url}` : url,
    });
  }
  return out;
}

/** A link target as written: a `www.` host without a scheme is https. */
export const linkHref = (href: string): string =>
  /^www\.[A-Za-z0-9-]/i.test(href) ? `https://${href}` : href;

const LINK_URL_MAX = 24;

/** `example.com/a-long/path` → `example.com/…`. */
export function shortenUrl(url: string): string {
  if (url.length <= LINK_URL_MAX) return url;
  const bare = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const slash = bare.indexOf('/');
  const host = slash < 0 ? bare : bare.slice(0, slash);
  if (host.length > 0 && host.length < LINK_URL_MAX) return `${host}/…`;
  return `${bare.slice(0, LINK_URL_MAX - 1)}…`;
}

/** A link's visible text: the URL without `http(s)://`, shortened. */
export const linkLabel = (href: string): string =>
  shortenUrl(href.replace(/^https?:\/\//i, ''));
