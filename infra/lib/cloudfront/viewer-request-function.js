/**
 * CloudFront Function (cloudfront-js-2.0) - viewer-request.
 * - www -> apex 301 (preserves query string)
 * - Legacy resume PDF filename -> /resume.pdf 301 (encoded or decoded)
 * - Skip rewrite for /api/* and /media/*
 * - /blog, /resume, /contact, /dont-feed-the-bears -> Option B {path}/index.html
 * - /blog/<slug> -> Option B only when slug is in the associated KeyValueStore
 *   (CHR-115); unknown slugs -> /404.html (avoids raw S3 XML)
 * - /admin, /auth -> /spa.html (neutral shell, not Home prerender)
 * - Other extensionless paths -> /404.html (NotFound, not Home)
 * - Direct /_shell.html is blocked (publisher template only; CHR-104)
 * - Paths with a file extension pass through unchanged
 *
 * No distribution-wide custom error pages (so /api and /assets keep real 403/404).
 *
 * Published slugs live in a CloudFront KeyValueStore (publisher UpdateKeys).
 * Until the first sync writes the __synced__ sentinel, blog slugs fail-open
 * (Option B for any slug), matching the prior CDK default of a null map.
 * Lookup uses exists(slug) first (one read on hit); miss checks the sentinel.
 * Unexpected KVS read errors fail-open so live posts don't 404 (CHR-119).
 * Local/tests can override via setPublishedBlogSlugsForTests().
 */
import cf from 'cloudfront';

/** Non-null = test/local override; null = use KVS (or fail-open if unavailable). */
var PUBLISHED_BLOG_SLUGS_OVERRIDE = null;

/** Pre-CMS resume PDF object name (spaces may arrive encoded or decoded). */
var LEGACY_RESUME_PDF = '/Christopher M Gagne Resume 2026.pdf';

async function handler(event) {
  var request = event.request;
  var host = request.headers.host.value.toLowerCase();

  if (host.indexOf('www.') === 0) {
    var apex = host.substring(4);
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: 'https://' + apex + request.uri + serializeQueryString(request.querystring) },
      },
    };
  }

  var uri = request.uri;
  if (isLegacyResumePdfUri(uri)) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: {
          value: '/resume.pdf' + serializeQueryString(request.querystring),
        },
      },
    };
  }

  if (uri === '/api' || uri.indexOf('/api/') === 0 || uri === '/media' || uri.indexOf('/media/') === 0) {
    return request;
  }

  // Pristine publisher shell is an origin object only — not a public URL (CHR-104).
  if (uri === '/_shell.html') {
    return {
      statusCode: 404,
      statusDescription: 'Not Found',
      headers: {
        'content-type': { value: 'text/plain; charset=utf-8' },
      },
      body: 'Not Found',
    };
  }

  if (uri === '/' || uri === '/index.html') {
    request.uri = '/index.html';
    return request;
  }

  if (isSpaShellPath(uri)) {
    request.uri = '/spa.html';
    return request;
  }

  if (isOptionBIndexPath(uri)) {
    request.uri = rewriteOptionB(uri);
    return request;
  }

  var blogSlug = blogPostSlug(uri);
  if (blogSlug !== null) {
    // Reject reserved / malformed slugs before KVS (CHR-123): __synced__ and
    // over-long keys must not fail-open to Option B or hit raw S3 XML.
    if (!isValidBlogSlug(blogSlug)) {
      request.uri = '/404.html';
      return request;
    }
    if (await isPublishedBlogSlug(blogSlug)) {
      request.uri = rewriteOptionB(uri);
    } else {
      request.uri = '/404.html';
    }
    return request;
  }

  if (uri.endsWith('/')) {
    request.uri = '/404.html';
  } else {
    var lastSlash = uri.lastIndexOf('/');
    var lastSegment = lastSlash === -1 ? uri : uri.substring(lastSlash + 1);
    if (lastSegment.indexOf('.') === -1) {
      request.uri = '/404.html';
    }
  }

  return request;
}

function isSpaShellPath(uri) {
  return (
    uri === '/admin' ||
    uri === '/admin/' ||
    uri.indexOf('/admin/') === 0 ||
    uri === '/auth' ||
    uri === '/auth/' ||
    uri.indexOf('/auth/') === 0
  );
}

function isOptionBIndexPath(uri) {
  return (
    uri === '/blog' ||
    uri === '/blog/' ||
    uri === '/resume' ||
    uri === '/resume/' ||
    uri.indexOf('/resume/') === 0 ||
    uri === '/contact' ||
    uri === '/contact/' ||
    uri.indexOf('/contact/') === 0 ||
    uri === '/dont-feed-the-bears' ||
    uri === '/dont-feed-the-bears/' ||
    uri.indexOf('/dont-feed-the-bears/') === 0
  );
}

function blogPostSlug(uri) {
  if (uri.indexOf('/blog/') !== 0) {
    return null;
  }
  var rest = uri.substring('/blog/'.length);
  if (!rest || rest === 'index.html') {
    return null;
  }
  var slash = rest.indexOf('/');
  var segment = slash === -1 ? rest : rest.substring(0, slash);
  if (!segment || segment.indexOf('.') !== -1) {
    return null;
  }
  if (slash !== -1) {
    var after = rest.substring(slash + 1);
    if (after && after !== 'index.html') {
      return null;
    }
  }
  return segment;
}

/** Published post slugs: lowercase alnum + hyphen; no reserved __*__ keys.
 * Max length must match MAX_SLUG_LENGTH in @gagnechris/shared (CHR-145). */
function isValidBlogSlug(slug) {
  if (!slug || slug.length > 120) {
    return false;
  }
  if (
    slug.length >= 4 &&
    slug.indexOf('__') === 0 &&
    slug.substring(slug.length - 2) === '__'
  ) {
    return false;
  }
  for (var i = 0; i < slug.length; i++) {
    var c = slug.charCodeAt(i);
    var ok =
      (c >= 48 && c <= 57) ||
      (c >= 97 && c <= 122) ||
      c === 45;
    if (!ok) {
      return false;
    }
  }
  return true;
}

async function isPublishedBlogSlug(slug) {
  if (PUBLISHED_BLOG_SLUGS_OVERRIDE !== null) {
    return Object.prototype.hasOwnProperty.call(
      PUBLISHED_BLOG_SLUGS_OVERRIDE,
      slug,
    );
  }
  try {
    var kvsHandle = cf.kvs();
    // exists(slug) first: one KVS read for published posts (CHR-119).
    var slugExists;
    try {
      slugExists = await kvsHandle.exists(slug);
    } catch (e) {
      // Transient / unexpected KVS error — fail-open so live posts don't 404.
      return true;
    }
    if (slugExists) {
      return true;
    }
    // Miss: enforce allowlist only once the __synced__ sentinel is present.
    try {
      if (await kvsHandle.exists('__synced__')) {
        return false;
      }
      return true;
    } catch (e) {
      return true;
    }
  } catch (e) {
    // KVS not associated or unavailable — fail-open.
    return true;
  }
}

function setPublishedBlogSlugsForTests(slugs) {
  PUBLISHED_BLOG_SLUGS_OVERRIDE = slugs;
}

function rewriteOptionB(uri) {
  if (uri.endsWith('/')) {
    return uri + 'index.html';
  }
  var lastSlash = uri.lastIndexOf('/');
  var lastSegment = lastSlash === -1 ? uri : uri.substring(lastSlash + 1);
  if (lastSegment.indexOf('.') === -1) {
    return uri + '/index.html';
  }
  return uri;
}

/**
 * Match the old resume PDF path whether CloudFront passed it percent-encoded
 * or already decoded (and tolerate one extra decode pass).
 */
function isLegacyResumePdfUri(uri) {
  var candidate = uri;
  for (var i = 0; i < 2; i++) {
    if (candidate === LEGACY_RESUME_PDF) {
      return true;
    }
    try {
      var decoded = decodeURIComponent(candidate);
      if (decoded === candidate) {
        break;
      }
      candidate = decoded;
    } catch (e) {
      break;
    }
  }
  return candidate === LEGACY_RESUME_PDF;
}

function serializeQueryString(qs) {
  if (!qs) {
    return '';
  }
  var parts = [];
  for (var key in qs) {
    if (!Object.prototype.hasOwnProperty.call(qs, key)) {
      continue;
    }
    var item = qs[key];
    if (item.multiValue) {
      for (var i = 0; i < item.multiValue.length; i++) {
        parts.push(key + '=' + item.multiValue[i].value);
      }
    } else if (item.value !== undefined) {
      parts.push(key + '=' + item.value);
    } else {
      parts.push(key + '=');
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}
