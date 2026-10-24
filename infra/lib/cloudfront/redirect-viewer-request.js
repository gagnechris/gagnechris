/**
 * Every request on a redirect domain goes to the same path and query on the
 * apex. The distribution allows plain HTTP so http:// also lands on https://
 * gagnechris.com in one hop.
 */
var TARGET_ORIGIN = 'https://gagnechris.com';

function handler(event) {
  var request = event.request;
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: {
        value:
          TARGET_ORIGIN +
          request.uri +
          serializeQueryString(request.querystring),
      },
      'cache-control': { value: 'max-age=86400' },
    },
  };
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
