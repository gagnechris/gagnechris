/**
 * CloudFront Function (cloudfront-js-2.0) - viewer-request.
 * - www -> apex 301 (preserves query string)
 * - Skip rewrite for /api/* and /media/* (proxied origins)
 * - /blog and /blog/* (extensionless) -> Option B {path}/index.html objects
 * - Other extensionless paths -> /index.html (SPA shell)
 * - Paths with a file extension pass through unchanged
 *
 * Missing objects return real 404/403 from the origin (no distribution-wide
 * custom error pages), so /api and /assets keep correct status codes.
 */
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
  if (uri === '/api' || uri.indexOf('/api/') === 0 || uri === '/media' || uri.indexOf('/media/') === 0) {
    return request;
  }

  // Option B: publisher writes blog/index.html and blog/<slug>/index.html.
  if (uri === '/blog' || uri === '/blog/' || uri.indexOf('/blog/') === 0) {
    if (uri.endsWith('/')) {
      request.uri = uri + 'index.html';
    } else {
      var blogLastSlash = uri.lastIndexOf('/');
      var blogSegment = blogLastSlash === -1 ? uri : uri.substring(blogLastSlash + 1);
      if (blogSegment.indexOf('.') === -1) {
        request.uri = uri + '/index.html';
      }
    }
    return request;
  }

  // SPA shell for non-blog client routes (/resume, /contact, /admin, …).
  if (uri.endsWith('/')) {
    request.uri = '/index.html';
  } else {
    var lastSlash = uri.lastIndexOf('/');
    var lastSegment = lastSlash === -1 ? uri : uri.substring(lastSlash + 1);
    if (lastSegment.indexOf('.') === -1) {
      request.uri = '/index.html';
    }
  }

  return request;
}

/**
 * Rebuild ?a=1&b=2 from CloudFront's querystring object.
 * Runtime values (and keys) arrive already percent-encoded — do not
 * encodeURIComponent again (live #35 deploy produced a%2520b).
 */
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
