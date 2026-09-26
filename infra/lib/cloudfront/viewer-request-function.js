/**
 * CloudFront Function (cloudfront-js-2.0) - viewer-request.
 * - www -> apex 301 (preserves query string)
 * - Skip rewrite for /api/* and /media/* (proxied origins)
 * - Extensionless paths -> /index.html (SPA shell) until CHR-34 Option B
 *   writes per-path index.html objects
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

  // SPA shell until the publisher emits Option B {path}/index.html objects.
  // Trailing slash and extensionless routes all map to the root index.html so
  // client-side routes (/resume, /blog, /auth/callback, ...) keep working.
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
 * Per AWS event-structure docs, values are decoded (e.g. spaces, not %20),
 * so we encodeURIComponent both keys and values when rebuilding the Location.
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
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(item.multiValue[i].value));
      }
    } else if (item.value !== undefined) {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(item.value));
    } else {
      parts.push(encodeURIComponent(key) + '=');
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}
