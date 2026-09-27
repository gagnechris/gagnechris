/**
 * CloudFront Function (cloudfront-js-2.0) - viewer-request.
 * - www -> apex 301 (preserves query string)
 * - Legacy resume PDF filename -> /resume.pdf 301 (encoded or decoded)
 * - Skip rewrite for /api/* and /media/*
 * - /blog, /resume, /contact, /dont-feed-the-bears -> Option B {path}/index.html
 * - /blog/<slug> -> Option B only when slug is published (see PUBLISHED_BLOG_SLUGS);
 *   unknown slugs -> /404.html (avoids raw S3 XML)
 * - /admin, /auth -> /spa.html (neutral shell, not Home prerender)
 * - Other extensionless paths -> /404.html (NotFound, not Home)
 * - Direct /_shell.html is blocked (publisher template only; CHR-104)
 * - Paths with a file extension pass through unchanged
 *
 * No distribution-wide custom error pages (so /api and /assets keep real 403/404).
 *
 * PUBLISHED_BLOG_SLUGS: null = fail-open (Option B for any slug, CDK default).
 * Publisher replaces the map after each rebuild (CHR-102).
 */
var PUBLISHED_BLOG_SLUGS = null; /*__PUBLISHED_BLOG_SLUGS__*/

/** Pre-CMS resume PDF object name (spaces may arrive encoded or decoded). */
var LEGACY_RESUME_PDF = '/Christopher M Gagne Resume 2026.pdf';

function handler(event) {
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
    if (isPublishedBlogSlug(blogSlug)) {
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

function isPublishedBlogSlug(slug) {
  if (PUBLISHED_BLOG_SLUGS === null) {
    return true;
  }
  return Object.prototype.hasOwnProperty.call(PUBLISHED_BLOG_SLUGS, slug);
}

function setPublishedBlogSlugsForTests(slugs) {
  PUBLISHED_BLOG_SLUGS = slugs;
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
