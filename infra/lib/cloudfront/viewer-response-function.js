/**
 * Default S3 behavior only. Turns publisher redirect pages into 301s and
 * /404.html into a 404. CloudFront doesn't run viewer-response functions
 * when the origin returns 4xx, so an S3 miss can't be rewritten here; the
 * viewer-request function sends unknown pages to /404.html instead.
 */
function handler(event) {
  var response = event.response;
  var headers = response.headers;

  // A renamed post's or project's old page, left by the publisher.
  var moved = headers['x-amz-meta-redirect-location'];
  if (moved && response.statusCode === 200) {
    delete headers['x-amz-meta-redirect-location'];
    response.statusCode = 301;
    response.statusDescription = 'Moved Permanently';
    headers.location = { value: moved.value };
    return response;
  }

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
