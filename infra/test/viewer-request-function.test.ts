import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_SLUG_LENGTH } from '@gagnechris/shared';

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
  setPublishedBlogSlugsForTests: (slugs: Record<string, number> | null) => void;
  setOptionBPrefixesForTests: (prefixes: string[] | null) => void;
};

type FakeKvs = {
  exists: (key: string) => Promise<boolean>;
  get?: (key: string) => Promise<string>;
};

function loadApi(fakeKvs?: FakeKvs | (() => FakeKvs)): HandlerApi {
  // The `cloudfront` import only exists at the edge, so strip it and stub
  // `cf.kvs()`.
  const kvsFactory =
    fakeKvs === undefined
      ? `function () { throw new Error('kvs unavailable in unit tests'); }`
      : typeof fakeKvs === 'function'
        ? `function () { return __fakeKvsFactory(); }`
        : `function () { return __fakeKvs; }`;
  return new Function(
    '__fakeKvs',
    '__fakeKvsFactory',
    `var cf = { kvs: ${kvsFactory} };
     ${fnSource}
     return { handler, setPublishedBlogSlugsForTests, setOptionBPrefixesForTests };`,
  )(
    typeof fakeKvs === 'function' ? undefined : fakeKvs,
    typeof fakeKvs === 'function' ? fakeKvs : undefined,
  ) as HandlerApi;
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
  api.setOptionBPrefixesForTests(null);
});

describe('viewer-request CloudFront Function', () => {
  it('redirects www to apex without a query string', async () => {
    const res = await runHandler({
      uri: '/posts',
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(res).toMatchObject({
      statusCode: 301,
      headers: { location: { value: 'https://gagnechris.com/posts' } },
    });
  });

  it('preserves a single query parameter on www redirect', async () => {
    const res = await runHandler({
      uri: '/posts',
      querystring: { utm_source: { value: 'linkedin' } },
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe(
      'https://gagnechris.com/posts?utm_source=linkedin',
    );
  });

  it('preserves multiple query parameters on www redirect', async () => {
    const res = await runHandler({
      uri: '/posts',
      querystring: {
        utm_source: { value: 'x' },
        a: { value: '1' },
      },
      headers: { host: { value: 'WWW.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe(
      'https://gagnechris.com/posts?utm_source=x&a=1',
    );
  });

  it('passes through already-encoded query values (no double-encoding)', async () => {
    const res = await runHandler({
      uri: '/posts',
      querystring: {
        q: { value: 'a%20b' },
        x: { value: '%2Fpath%3Fz%26y' },
      },
      headers: { host: { value: 'www.gagnechris.com' } },
    });
    expect(locationOf(res)).toBe(
      'https://gagnechris.com/posts?q=a%20b&x=%2Fpath%3Fz%26y',
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

  it('redirects legacy /blog URLs to /posts with the query string', async () => {
    const cases: Array<[string, string]> = [
      ['/blog', '/posts'],
      ['/blog/', '/posts/'],
      ['/blog/welcome', '/posts/welcome'],
      ['/blog/posts.json', '/posts/posts.json'],
    ];
    for (const [uri, location] of cases) {
      const res = await runHandler({
        uri,
        headers: { host: { value: 'gagnechris.com' } },
      });
      expect((res as { statusCode: number }).statusCode).toBe(301);
      expect(locationOf(res)).toBe(location);
    }
    const withQuery = await runHandler({
      uri: '/blog/welcome',
      querystring: { utm_source: { value: 'rss' } },
      headers: { host: { value: 'gagnechris.com' } },
    });
    expect(locationOf(withQuery)).toBe('/posts/welcome?utm_source=rss');
  });

  it('does not treat paths that merely start with /blog or /posts as posts', async () => {
    for (const uri of ['/blogroll', '/postscript']) {
      expect(
        (
          (await runHandler({
            uri,
            headers: { host: { value: 'gagnechris.com' } },
          })) as CfRequest
        ).uri,
      ).toBe('/404.html');
    }
  });

  it('rewrites /posts index to Option B index.html', async () => {
    expect(
      (
        (await runHandler({
          uri: '/posts',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/index.html');
    expect(
      (
        (await runHandler({
          uri: '/posts/',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/index.html');
  });

  it('rewrites known /posts slugs to blog/ storage and unknown slugs to /404.html', async () => {
    api.setPublishedBlogSlugsForTests({ welcome: 1 });
    expect(
      (
        (await runHandler({
          uri: '/posts/welcome',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/welcome/index.html');
    expect(
      (
        (await runHandler({
          uri: '/posts/welcome/',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/welcome/index.html');
    expect(
      (
        (await runHandler({
          uri: '/posts/typo',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/404.html');
    expect(
      (
        (await runHandler({
          uri: '/posts/posts.json',
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
          uri: '/posts/anything',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/blog/anything/index.html');
  });

  describe('KVS allowlist', () => {
    function createCountingKvs(
      store: Record<string, boolean>,
      opts?: {
        errorOn?: string | ((key: string) => boolean);
      },
    ) {
      const calls: string[] = [];
      const kvs: FakeKvs = {
        async exists(key) {
          calls.push(key);
          if (
            opts?.errorOn === key ||
            (typeof opts?.errorOn === 'function' && opts.errorOn(key))
          ) {
            throw new Error(`kvs error for ${key}`);
          }
          return Boolean(store[key]);
        },
      };
      return { kvs, calls };
    }

    it('hits: one exists(slug) read serves Option B', async () => {
      const { kvs, calls } = createCountingKvs({
        welcome: true,
        __synced__: true,
      });
      const kvsApi = loadApi(kvs);
      kvsApi.setPublishedBlogSlugsForTests(null);
      expect(
        (
          (await kvsApi.handler({
            request: {
              uri: '/posts/welcome',
              headers: { host: { value: 'gagnechris.com' } },
            },
          })) as CfRequest
        ).uri,
      ).toBe('/blog/welcome/index.html');
      expect(calls).toEqual(['welcome']);
    });

    it('misses: exists(slug) then sentinel → /404.html', async () => {
      const { kvs, calls } = createCountingKvs({
        welcome: true,
        __synced__: true,
      });
      const kvsApi = loadApi(kvs);
      kvsApi.setPublishedBlogSlugsForTests(null);
      expect(
        (
          (await kvsApi.handler({
            request: {
              uri: '/posts/typo',
              headers: { host: { value: 'gagnechris.com' } },
            },
          })) as CfRequest
        ).uri,
      ).toBe('/404.html');
      expect(calls).toEqual(['typo', '__synced__']);
    });

    it('fail-opens when exists(slug) throws (live post must not 404)', async () => {
      const { kvs, calls } = createCountingKvs(
        { welcome: true, __synced__: true },
        { errorOn: 'welcome' },
      );
      const kvsApi = loadApi(kvs);
      kvsApi.setPublishedBlogSlugsForTests(null);
      expect(
        (
          (await kvsApi.handler({
            request: {
              uri: '/posts/welcome',
              headers: { host: { value: 'gagnechris.com' } },
            },
          })) as CfRequest
        ).uri,
      ).toBe('/blog/welcome/index.html');
      expect(calls).toEqual(['welcome']);
    });

    it('fail-opens when sentinel is absent (pre-first-sync)', async () => {
      const { kvs, calls } = createCountingKvs({});
      const kvsApi = loadApi(kvs);
      kvsApi.setPublishedBlogSlugsForTests(null);
      expect(
        (
          (await kvsApi.handler({
            request: {
              uri: '/posts/anything',
              headers: { host: { value: 'gagnechris.com' } },
            },
          })) as CfRequest
        ).uri,
      ).toBe('/blog/anything/index.html');
      expect(calls).toEqual(['anything', '__synced__']);
    });

    it('rejects reserved __synced__ and over-long slugs without querying KVS', async () => {
      const { kvs, calls } = createCountingKvs({
        __synced__: true,
        welcome: true,
      });
      const kvsApi = loadApi(kvs);
      kvsApi.setPublishedBlogSlugsForTests(null);

      expect(
        (
          (await kvsApi.handler({
            request: {
              uri: '/posts/__synced__',
              headers: { host: { value: 'gagnechris.com' } },
            },
          })) as CfRequest
        ).uri,
      ).toBe('/404.html');

      const longSlug = 'a'.repeat(121);
      expect(
        (
          (await kvsApi.handler({
            request: {
              uri: `/posts/${longSlug}`,
              headers: { host: { value: 'gagnechris.com' } },
            },
          })) as CfRequest
        ).uri,
      ).toBe('/404.html');

      expect(calls).toEqual([]);
    });

    it('routes a max-length published slug', async () => {
      const maxSlug = 'a'.repeat(MAX_SLUG_LENGTH);
      const { kvs, calls } = createCountingKvs({
        __synced__: true,
        [maxSlug]: true,
      });
      const kvsApi = loadApi(kvs);
      kvsApi.setPublishedBlogSlugsForTests(null);

      expect(
        (
          (await kvsApi.handler({
            request: {
              uri: `/posts/${maxSlug}`,
              headers: { host: { value: 'gagnechris.com' } },
            },
          })) as CfRequest
        ).uri,
      ).toBe(`/blog/${maxSlug}/index.html`);
      expect(calls).toEqual([maxSlug]);
    });
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

  it('serves /now via Option B when a target registers the path', async () => {
    // Simulates codegen after a page target adds optionBPaths: ['/now'].
    api.setOptionBPrefixesForTests([
      '/blog',
      '/contact',
      '/dont-feed-the-bears',
      '/now',
      '/resume',
    ]);
    expect(
      (
        (await runHandler({
          uri: '/now',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/now/index.html');
    expect(
      (
        (await runHandler({
          uri: '/now/',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/now/index.html');
  });

  describe('old apex /admin and /auth URLs', () => {
    const apex = (
      uri: string,
      querystring?: CfRequest['querystring'],
    ): CfRequest => ({
      uri,
      querystring,
      headers: { host: { value: 'gagnechris.com' } },
    });

    async function expectAppRedirect(request: CfRequest, location: string) {
      const res = await runHandler(request);
      expect(res).toMatchObject({
        statusCode: 301,
        headers: {
          location: { value: location },
          'cache-control': { value: 'max-age=86400' },
        },
      });
    }

    it('301s /admin/notebook* to the Notebook host with the rest of the path and the query', async () => {
      const cases: Array<[CfRequest, string]> = [
        [apex('/admin/notebook'), 'https://notebook.gagnechris.com/'],
        [apex('/admin/notebook/'), 'https://notebook.gagnechris.com/'],
        [
          apex('/admin/notebook/today'),
          'https://notebook.gagnechris.com/today',
        ],
        [
          apex('/admin/notebook/notes/01J9ZX', {
            date: { value: '2026-10-03' },
            tag: { multiValue: [{ value: 'a' }, { value: 'b' }] },
          }),
          'https://notebook.gagnechris.com/notes/01J9ZX?date=2026-10-03&tag=a&tag=b',
        ],
      ];
      for (const [request, location] of cases) {
        await expectAppRedirect(request, location);
      }
    });

    it('301s other /admin* paths to the admin host with the rest of the path and the query', async () => {
      const cases: Array<[CfRequest, string]> = [
        [apex('/admin'), 'https://admin.gagnechris.com/'],
        [apex('/admin/'), 'https://admin.gagnechris.com/'],
        [apex('/admin/posts'), 'https://admin.gagnechris.com/posts'],
        [
          apex('/admin/posts/01J9ZX/edit', { tab: { value: 'meta' } }),
          'https://admin.gagnechris.com/posts/01J9ZX/edit?tab=meta',
        ],
        [apex('/admin/notebooks'), 'https://admin.gagnechris.com/notebooks'],
        [
          apex('/admin/resume/notebook'),
          'https://admin.gagnechris.com/resume/notebook',
        ],
      ];
      for (const [request, location] of cases) {
        await expectAppRedirect(request, location);
      }
    });

    it('301s /auth* to the Notebook root and drops the query string', async () => {
      for (const uri of ['/auth', '/auth/', '/auth/callback', '/auth/x/y']) {
        await expectAppRedirect(
          apex(uri, {
            code: { value: 'secret-code' },
            state: { value: 'secret-state' },
          }),
          'https://notebook.gagnechris.com/',
        );
      }
    });

    it('treats case and encoding variants the same in one hop', async () => {
      const cases: Array<[CfRequest, string]> = [
        [
          apex('/ADMIN/notebook', { x: { value: '1' } }),
          'https://notebook.gagnechris.com/?x=1',
        ],
        [apex('/Admin'), 'https://admin.gagnechris.com/'],
        [apex('/aDmIn/posts/AbC'), 'https://admin.gagnechris.com/posts/AbC'],
        [
          apex('/Admin/Notebook/Notes/AbC'),
          'https://notebook.gagnechris.com/Notes/AbC',
        ],
        [
          apex('/admin/%6Eotebook/today'),
          'https://notebook.gagnechris.com/today',
        ],
        [apex('/%61dmin/'), 'https://admin.gagnechris.com/'],
        [
          apex('/AUTH/callback', { code: { value: 'c' } }),
          'https://notebook.gagnechris.com/',
        ],
        [apex('/%41uth'), 'https://notebook.gagnechris.com/'],
      ];
      for (const [request, location] of cases) {
        await expectAppRedirect(request, location);
      }
    });

    it('sends www variants to the apex first', async () => {
      const res = await runHandler({
        uri: '/admin/posts',
        headers: { host: { value: 'www.gagnechris.com' } },
      });
      expect(locationOf(res)).toBe('https://gagnechris.com/admin/posts');
    });

    it('leaves paths that only start with admin or auth alone', async () => {
      api.setPublishedBlogSlugsForTests({});
      for (const uri of [
        '/Administrator',
        '/administrator',
        '/authors',
        '/adminx/posts',
        '/admin%2Fposts',
        '/posts/admin',
        '/%E0%A4%A',
      ]) {
        const res = await runHandler(apex(uri));
        expect(res).not.toHaveProperty('statusCode');
        expect((res as CfRequest).uri).toBe('/404.html');
      }
    });

    it('never redirects /.well-known', async () => {
      for (const uri of [
        '/.well-known/apple-app-site-association',
        '/.well-known/webauthn',
        '/.well-known/admin',
        '/.well-known/auth/callback',
      ]) {
        const res = await runHandler(apex(uri));
        expect(res).not.toHaveProperty('statusCode');
        expect((res as CfRequest).uri).toBe(uri);
      }
    });

    it('leaves other mixed-case paths alone', async () => {
      api.setPublishedBlogSlugsForTests({});
      for (const uri of ['/posts/Some-Slug', '/Resume']) {
        const res = await runHandler(apex(uri));
        expect(res).not.toHaveProperty('statusCode');
      }
    });
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

  it('passes through /.well-known/* (AASA / webauthn)', async () => {
    expect(
      (
        (await runHandler({
          uri: '/.well-known/apple-app-site-association',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/.well-known/apple-app-site-association');
    expect(
      (
        (await runHandler({
          uri: '/.well-known/webauthn',
          headers: { host: { value: 'gagnechris.com' } },
        })) as CfRequest
      ).uri,
    ).toBe('/.well-known/webauthn');
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
