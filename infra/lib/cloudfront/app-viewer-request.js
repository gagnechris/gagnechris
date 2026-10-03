/**
 * SPA fallback for the admin and notebook hosts. No case canonicalization:
 * each host has one CSP for every path, so case variants can't change it.
 * There are no distribution-wide error pages, so /api keeps its real 4xx.
 */
var PASS_THROUGH_PREFIXES = ['/api', '/assets', '/media', '/.well-known'];

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  for (var i = 0; i < PASS_THROUGH_PREFIXES.length; i++) {
    var prefix = PASS_THROUGH_PREFIXES[i];
    if (uri === prefix || uri.indexOf(prefix + '/') === 0) {
      return request;
    }
  }

  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') !== -1) {
    return request;
  }

  request.uri = '/index.html';
  return request;
}
