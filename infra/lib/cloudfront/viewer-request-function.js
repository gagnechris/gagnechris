/**
 * CloudFront Function (cloudfront-js-2.0) — viewer-request.
 * - www → apex 301
 * - Extensionless paths → {path}/index.html (Option B pre-rendered pages)
 * - Paths with a file extension pass through unchanged
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
        location: { value: 'https://' + apex + request.uri },
      },
    };
  }

  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else {
    var lastSlash = uri.lastIndexOf('/');
    var lastSegment = lastSlash === -1 ? uri : uri.substring(lastSlash + 1);
    if (lastSegment.indexOf('.') === -1) {
      request.uri = uri + '/index.html';
    }
  }

  return request;
}
