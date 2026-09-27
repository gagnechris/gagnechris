import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fnSource = readFileSync(
  join(__dirname, '../lib/cloudfront/viewer-request-function.js'),
  'utf8',
).replace(/import cf from 'cloudfront';\s*/g, '');

type CfRequest = {
  uri: string;
  querystring?: Record<
    string,
    { value?: string; multiValue?: Array<{ value: string }> }
  >;
  headers: { host: { value: string } };
};

type CfResponse =
  | CfRequest
  | {
      statusCode: number;
      statusDescription: string;
      headers: Record<string, { value: string }>;
      body?: string;
    };

type HandlerApi = {
  handler: (event: { request: CfRequest }) => Promise<CfResponse>;
  setPublishedBlogSlugsForTests: (
    slugs: Record<string, number> | null,
  ) => void;
};

function loadApi(): HandlerApi {
  // CloudFront Functions expose handler(event); eval in a sandbox.
  // Strip CF `import` and stub `cf.kvs()` so override/fail-open paths work.
  // eslint-disable-next-line no-new-func -- intentional: load CF Function source
  return new Function(
    `var cf = { kvs: function () { throw new Error('kvs unavailable in unit tests'); } };
     ${fnSource}
     return { handler, setPublishedBlogSlugsForTests };`,
  )() as HandlerApi;
}

const api = loadApi();

async function runHandler(request: CfRequest): Promise<CfResponse> {
  return api.handler({ request });
}

function locationOf(res: CfResponse): string {
  return (res as unknown as { headers: { location: { value: string } } })
    .headers.location.value;
}

afterEach(() => {
  api.setPublishedBlogSlugsForTests(null);
});

describe('viewer-request CloudFront Function', () => {
  it('redirects www to apex without a query string', async () => {
    const res = await runHandler({
      uri: '/blog',
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(res).toMatchObject({
      statusCode: 301,
      headers: { location: { value: 'https://gagnechris.com/blog' } },
    });
  });

  it('preserves a single query parameter on www redirect', async () => {
    const res = await runHandler({
      uri: '/blog',
      querystring: { utm_source: { value: 'linkedin' } },
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe(
      'https://gagnechris.com/blog?utm_source=linkedin',
    );
  });

  it('preserves multiple query parameters on www redirect', async () => {
    const res = await runHandler({
      uri: '/blog',
      querystring: {
        utm_source: { value: 'x' },
        a: { value: '1' },
      },
      headers: { host: { value: 'WWW.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe(
      'https://gagnechris.com/blog?utm_source=x&a=1',
    );
  });

  it('passes through already-encoded query values (no double-encoding)', async () => {
    const res = await runHandler({
      uri: '/blog',
      querystring: {
        q: { value: 'a%20b' },
        x: { value: '%2Fpath%3Fz%26y' },
      },
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe(
      'https://gagnechris.com/blog?q=a%20b&x=%2Fpath%3Fz%26y',
    );
  });

  it('preserves multi-value query keys as received', async () => {
    const res = await runHandler({
      uri: '/',
      querystring: {
        tag: {
          multiValue: [{ value: 'a' }, { value: 'b' }],
        },
      },
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe('https://gagnechris.com/?tag=a&tag=b');
  });

  it('rewrites /blog index to Option B index.html', async () => {
    expect(
      (
        (await runHandler({
          uri: '/blog',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/index.html');
    expect(
      (
        (await runHandler({
          uri: '/blog/',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/index.html');
  });

  it('rewrites known blog slugs to Option B and unknown slugs to /404.html', async () => {
    api.setPublishedBlogSlugsForTests({ welcome: 1 });
    expect(
      (
        (await runHandler({
          uri: '/blog/welcome',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/welcome/index.html');
    expect(
      (
        (await runHandler({
          uri: '/blog/welcome/',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/welcome/index.html');
    expect(
      (
        (await runHandler({
          uri: '/blog/typo',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/404.html');
    expect(
      (
        (await runHandler({
          uri: '/blog/posts.json',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/posts.json');
  });

  it('fail-opens blog slugs when the published map is null', async () => {
    api.setPublishedBlogSlugsForTests(null);
    expect(
      (
        (await runHandler({
          uri: '/blog/anything',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/anything/index.html');
  });

  it('rewrites /resume, /contact, and /dont-feed-the-bears to Option B', async () => {
    expect(
      (
        (await runHandler({
          uri: '/resume',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/resume/index.html');
    expect(
      (
        (await runHandler({
          uri: '/contact',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/contact/index.html');
    expect(
      (
        (await runHandler({
          uri: '/dont-feed-the-bears',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/dont-feed-the-bears/index.html');
  });

  it('rewrites /admin and /auth to the neutral SPA shell', async () => {
    for (const uri of ['/auth/callback', '/admin', '/admin/posts']) {
      const req = (await runHandler({
        uri,
        headers: { host: { value: 'gagnechris.com' } },
      })) as CfRequest;
      expect(req.uri).toBe('/spa.html');
    }
  });

  it('rewrites trailing-slash SPA paths to the SPA shell', async () => {
    const req = (await runHandler({
      uri: '/admin/',
      headers: { host: { value: 'gagnechris.com' } },
    })) as CfRequest;
    expect(req.uri).toBe('/spa.html');
  });

  it('rewrites unknown extensionless paths to /404.html', async () => {
    expect(
      (
        (await runHandler({
          uri: '/does-not-exist',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/404.html');
    expect(
      (
        (await runHandler({
          uri: '/old/path/',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/404.html');
  });

  it('keeps / as the home index.html shell', async () => {
    expect(
      (
        (await runHandler({
          uri: '/',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/index.html');
  });


  it('blocks direct public access to _shell.html', async () => {
    const res = await runHandler({
      uri: '/_shell.html',
      headers: { host: { value: 'gagnechris.com' } },
    });
    expect(res).toMatchObject({
      statusCode: 404,
      statusDescription: 'Not Found',
    });
  });

  it('does not rewrite /api or /media paths', async () => {
    expect(
      (
        (await runHandler({
          uri: '/api/nope',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/api/nope');
    expect(
      (
        (await runHandler({
          uri: '/media/photo.png',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/media/photo.png');
  });

  it('passes through paths with a file extension', async () => {
    const req = (await runHandler({
      uri: '/assets/app.js',
      headers: { host: { value: 'gagnechris.com' } },
    })) as CfRequest;
    expect(req.uri).toBe('/assets/app.js');
  });

  it('301s the legacy encoded resume PDF path to /resume.pdf', async () => {
    const res = await runHandler({
      uri: '/Christopher%20M%20Gagne%20Resume%202026.pdf',
      headers: { host: { value: 'gagnechris.com' } },
    });
    expect(res).toMatchObject({
      statusCode: 301,
      headers: { location: { value: '/resume.pdf' } },
    });
  });

  it('301s the legacy decoded resume PDF path to /resume.pdf', async () => {
    const res = await runHandler({
      uri: '/Christopher M Gagne Resume 2026.pdf',
      headers: { host: { value: 'gagnechris.com' } },
    });
    expect(res).toMatchObject({
      statusCode: 301,
      headers: { location: { value: '/resume.pdf' } },
    });
  });

  it('preserves query string on legacy resume PDF redirect', async () => {
    const res = await runHandler({
      uri: '/Christopher%20M%20Gagne%20Resume%202026.pdf',
      querystring: { utm_source: { value: 'linkedin' } },
      headers: { host: { value: 'gagnechris.com' } },
    });
    expect(locationOf(res)).toBe('/resume.pdf?utm_source=linkedin');
  });

  it('does not redirect other PDFs', async () => {
    const req = (await runHandler({
      uri: '/resume.pdf',
      headers: { host: { value: 'gagnechris.com' } },
    })) as CfRequest;
    expect(req.uri).toBe('/resume.pdf');
  });
});
