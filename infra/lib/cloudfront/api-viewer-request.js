/**
 * /api/* on every host. API Gateway sees the CloudFront edge as the source
 * IP, so the viewer's address travels in a header. The API trusts it only
 * next to the origin secret CloudFront adds as an origin custom header; a
 * viewer's own copy of that header is dropped here.
 */
function handler(event) {
  var request = event.request;
  delete request.headers['x-origin-verify'];
  request.headers['x-viewer-address'] = { value: event.viewer.ip };
  return request;
}
