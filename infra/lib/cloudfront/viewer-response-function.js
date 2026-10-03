/**
 * CloudFront Function (cloudfront-js-2.0) - viewer-response on the S3 default
 * behavior only (not /api, /assets, or /media).
 *
 * - Serving /404.html with a body (200) → force HTTP 404 and disable caching
 *   so revalidation never returns a blank 304 (CHR-117)
 * - S3 NoSuchKey / AccessDenied XML for missing Option B HTML → site HTML 404
 *
 * Keeps distribution-wide errorResponses off so API JSON 403/404 stay intact
 * (CHR-62 / CHR-102).
 */
function handler(event) {
  var request = event.request;
  var response = event.response;
  var uri = request.uri;
  var status = response.statusCode;

  if (uri === '/404.html') {
    // 304 has no body — rewriting its status alone yields a blank page.
    if (status === 304) {
      return htmlNotFoundResponse();
    }
    if (status === 200) {
      response.statusCode = 404;
      response.statusDescription = 'Not Found';
      response.headers['cache-control'] = { value: 'no-cache' };
      delete response.headers.etag;
      delete response.headers['last-modified'];
      return response;
    }
  }

  if (status === 404 || status === 403) {
    var ctHeader = response.headers['content-type'];
    var ct = ctHeader && ctHeader.value ? ctHeader.value.toLowerCase() : '';
    // S3 error documents are application/xml (sometimes empty content-type).
    if (
      ct.indexOf('xml') !== -1 ||
      ct === '' ||
      ct.indexOf('text/plain') !== -1
    ) {
      return htmlNotFoundResponse();
    }
  }

  return response;
}

function htmlNotFoundResponse() {
  return {
    statusCode: 404,
    statusDescription: 'Not Found',
    headers: {
      'content-type': { value: 'text/html; charset=utf-8' },
      'cache-control': { value: 'no-cache' },
    },
    body: NOT_FOUND_HTML,
  };
}

// Compact static NotFound (no SPA). Full prerender lives at /404.html.
var NOT_FOUND_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"/>' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
  '<title>Page Not Found - Chris Gagne</title>' +
  '<meta name="robots" content="noindex"/>' +
  '<meta name="description" content="That URL does not match a page on this site."/>' +
  '<style>' +
  'body{font-family:system-ui,sans-serif;margin:0;padding:2rem;background:#f8fafc;color:#0f172a}' +
  'main{max-width:40rem;margin:0 auto;background:#fff;padding:1.5rem;border-radius:8px}' +
  'h1{margin:0 0 1rem;font-size:1.75rem}a{color:#1d4ed8}ul{padding-left:1.25rem}' +
  '</style></head><body><main>' +
  '<h1>Page not found</h1>' +
  '<p>That URL does not match a page on this site.</p>' +
  '<p><a href="/">Back to Home</a></p>' +
  '<ul>' +
  '<li><a href="/">Home</a></li>' +
  '<li><a href="/writing">Writing</a></li>' +
  '<li><a href="/resume">Resume</a></li>' +
  '<li><a href="/contact">Contact</a></li>' +
  '</ul></main></body></html>';
