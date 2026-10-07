import { afterEach, describe, expect, it } from 'vitest';
import { MAX_SLUG_LENGTH } from '@gagnechris/shared';
import {
  loadViewerRequest,
  type CfKvs as FakeKvs,
  type CfRequest,
  type CfResponse as CfEdgeResponse,
  type ViewerRequestApi as HandlerApi,
} from '../lib/cloudfront/harness.js';

type CfResponse = CfRequest | CfEdgeResponse;

const loadApi = (kvs?: FakeKvs | (() => FakeKvs)) => loadViewerRequest({ kvs });

const api = loadApi();

async function runHandler(request: CfRequest): Promise<CfResponse> {
  return api.handler({ request });
}

function locationOf(res: CfResponse): string {
  return (res as unknown as { headers: { location: { value: string } } })
    .headers.location.value;
}

afterEach(() => {
  api.setPublishedKeysForTests(null);
  api.setOptionBPagesForTests(null);
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
    api.setPublishedKeysForTests({ welcome: 1 });
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
    api.setPublishedKeysForTests(null);
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
      kvsApi.setPublishedKeysForTests(null);
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
      kvsApi.setPublishedKeysForTests(null);
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
      kvsApi.setPublishedKeysForTests(null);
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
      kvsApi.setPublishedKeysForTests(null);
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
      kvsApi.setPublishedKeysForTests(null);

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
      kvsApi.setPublishedKeysForTests(null);

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
    api.setOptionBPagesForTests([
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
      api.setPublishedKeysForTests({});
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
      api.setPublishedKeysForTests({});
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

  const routedUri = async (uri: string, handlerApi: HandlerApi = api) =>
    (
      (await handlerApi.handler({
        request: { uri, headers: { host: { value: 'gagnechris.com' } } },
      })) as CfRequest
    ).uri;

  it('serves exactly the known Option B pages, with or without a trailing slash', async () => {
    for (const page of [
      '/resume',
      '/contact',
      '/dont-feed-the-bears',
      '/dont-feed-the-bears/camp',
      '/dont-feed-the-bears/wild',
      '/projects',
    ]) {
      for (const uri of [page, `${page}/`, `${page}/index.html`]) {
        expect(await routedUri(uri), uri).toBe(`${page}/index.html`);
      }
    }
  });

  it('sends unknown pages under an Option B prefix to /404.html', async () => {
    api.setPublishedKeysForTests({ welcome: 1 });
    for (const uri of [
      '/resume/x',
      '/resume/x/',
      '/contact/x',
      '/dont-feed-the-bears/x',
      '/dont-feed-the-bears/camp/x',
      '/dont-feed-the-bears/wild/x/index.html',
      '/posts/welcome/x',
      '/resume/x/index.html',
    ]) {
      expect(await routedUri(uri), uri).toBe('/404.html');
    }
  });

  it('sends .html URLs that are not pages to /404.html', async () => {
    for (const uri of [
      '/x.html',
      '/resume.html',
      '/resume/x.html',
      '/posts/x.html',
      '/projects/x.html',
      '/404.html',
    ]) {
      expect(await routedUri(uri), uri).toBe('/404.html');
    }
    expect(await routedUri('/index.html')).toBe('/index.html');
    expect(await routedUri('/contact/index.html')).toBe('/contact/index.html');
  });

  it('passes files that are not pages through, under a prefix too', async () => {
    for (const [uri, expected] of [
      ['/posts/posts.json', '/blog/posts.json'],
      ['/resume/photo.png', '/resume/photo.png'],
      ['/rss.xml', '/rss.xml'],
      ['/robots.txt', '/robots.txt'],
    ]) {
      expect(await routedUri(uri), uri).toBe(expected);
    }
  });

  it('drops validators on the way to /404.html so CloudFront cannot answer 304', async () => {
    const headers = {
      host: { value: 'gagnechris.com' },
      'if-none-match': { value: '"abc"' },
      'if-modified-since': { value: 'Wed, 01 Jan 2100 00:00:00 GMT' },
    };
    const missing = (await runHandler({
      uri: '/resume/x',
      headers: { ...headers },
    })) as CfRequest;
    expect(missing.uri).toBe('/404.html');
    expect(missing.headers).toEqual({ host: { value: 'gagnechris.com' } });

    const page = (await runHandler({
      uri: '/resume',
      headers: { ...headers },
    })) as CfRequest;
    expect(page.uri).toBe('/resume/index.html');
    expect(page.headers).toEqual(headers);
  });

  describe('/projects/<slug> KVS allowlist', () => {
    function kvsWith(keys: string[], errorOn?: string) {
      const calls: string[] = [];
      const kvs: FakeKvs = {
        async exists(key) {
          calls.push(key);
          if (key === errorOn) throw new Error(`kvs error for ${key}`);
          return keys.includes(key);
        },
      };
      return { api: loadApi(kvs), calls };
    }

    it('serves a published project with one KVS read', async () => {
      const { api: kvsApi, calls } = kvsWith([
        'projects/notebook',
        'projects/__synced__',
      ]);
      for (const uri of [
        '/projects/notebook',
        '/projects/notebook/',
        '/projects/notebook/index.html',
      ]) {
        expect(await routedUri(uri, kvsApi), uri).toBe(
          '/projects/notebook/index.html',
        );
      }
      expect(calls).toEqual([
        'projects/notebook',
        'projects/notebook',
        'projects/notebook',
      ]);
    });

    it('sends an unknown project to /404.html once synced', async () => {
      const { api: kvsApi, calls } = kvsWith([
        'projects/notebook',
        'projects/__synced__',
      ]);
      expect(await routedUri('/projects/x', kvsApi)).toBe('/404.html');
      expect(calls).toEqual(['projects/x', 'projects/__synced__']);
    });

    it('keeps posts and projects apart', async () => {
      const { api: kvsApi } = kvsWith([
        'notebook',
        '__synced__',
        'projects/posts',
        'projects/__synced__',
      ]);
      expect(await routedUri('/projects/notebook', kvsApi)).toBe('/404.html');
      expect(await routedUri('/posts/posts', kvsApi)).toBe('/404.html');
      expect(await routedUri('/projects/posts', kvsApi)).toBe(
        '/projects/posts/index.html',
      );
    });

    it('fails open before the first project sync, even when posts are synced', async () => {
      const { api: kvsApi } = kvsWith(['welcome', '__synced__']);
      expect(await routedUri('/projects/anything', kvsApi)).toBe(
        '/projects/anything/index.html',
      );
    });

    it('fails open on a KVS error', async () => {
      const { api: kvsApi } = kvsWith(
        ['projects/__synced__'],
        'projects/notebook',
      );
      expect(await routedUri('/projects/notebook', kvsApi)).toBe(
        '/projects/notebook/index.html',
      );
    });

    it('rejects reserved and invalid slugs without reading the KVS', async () => {
      const { api: kvsApi, calls } = kvsWith(['projects/__synced__']);
      for (const uri of [
        '/projects/__synced__',
        '/projects/Notebook',
        `/projects/${'a'.repeat(121)}`,
        '/projects/a/b',
      ]) {
        expect(await routedUri(uri, kvsApi), uri).toBe('/404.html');
      }
      expect(calls).toEqual([]);
    });

    it('serves /projects without reading the KVS', async () => {
      const { api: kvsApi, calls } = kvsWith(['projects/__synced__']);
      expect(await routedUri('/projects', kvsApi)).toBe('/projects/index.html');
      expect(await routedUri('/projects/', kvsApi)).toBe(
        '/projects/index.html',
      );
      expect(calls).toEqual([]);
    });
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
