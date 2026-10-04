/**
 * Default S3 behavior only. CloudFront doesn't run viewer-response functions
 * when the origin returns 4xx, so an S3 miss can't be rewritten here; the
 * viewer-request function sends unknown pages to /404.html instead.
 */
function handler(event) {
  var response = event.response;

  if (event.request.uri === '/404.html' && response.statusCode === 200) {
    response.statusCode = 404;
    response.statusDescription = 'Not Found';
    // No validators, so a revisit never gets a bodiless 304.
    response.headers['cache-control'] = { value: 'no-cache' };
    delete response.headers.etag;
    delete response.headers['last-modified'];
  }

  return response;
}
