/**
 * Local static origin that applies the real CloudFront viewer-request function
 * before serving files from SITE_BUCKET_NAME (.local-site), and mirrors
 * viewer-response 404 handling for missing Option B objects (CHR-102).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.LOCAL_SITE_PORT || 4177);
const root = process.env.SITE_BUCKET_NAME;
if (!root) {
  throw new Error('SITE_BUCKET_NAME (local site root) is required');
}

const viewerRequestPath = join(
  __dirname,
  '../../../infra/lib/cloudfront/viewer-request-function.js',
);
const viewerResponsePath = join(
  __dirname,
  '../../../infra/lib/cloudfront/viewer-response-function.js',
);

type CfRequest = {
  uri: string;
  querystring?: Record<string, { value?: string }>;
  headers: { host: { value: string } };
};

type CfResponse = {
  statusCode: number;
  statusDescription?: string;
  headers: Record<string, { value: string }>;
  body?: string;
};

type ViewerRequestApi = {
  handler: (
    event: { request: CfRequest },
  ) => Promise<CfRequest | { statusCode: number }>;
  setPublishedBlogSlugsForTests: (
    slugs: Record<string, number> | null,
  ) => void;
};

async function loadViewerRequestApi(): Promise<ViewerRequestApi> {
  const source = (await readFile(viewerRequestPath, 'utf8')).replace(
    /import cf from 'cloudfront';\s*/g,
    '',
  );
  // eslint-disable-next-line no-new-func -- intentional: load CF Function source
  return new Function(
    `var cf = { kvs: function () { throw new Error('kvs unavailable locally'); } };
     ${source}
     return { handler, setPublishedBlogSlugsForTests };`,
  )() as ViewerRequestApi;
}

async function loadViewerResponseHandler(): Promise<
  (event: { request: { uri: string }; response: CfResponse }) => CfResponse
> {
  const source = await readFile(viewerResponsePath, 'utf8');
  // eslint-disable-next-line no-new-func -- intentional: load CF Function source
  return new Function(`${source}\nreturn handler;`)() as (
    event: { request: { uri: string }; response: CfResponse },
  ) => CfResponse;
}

async function loadPublishedSlugs(api: ViewerRequestApi): Promise<void> {
  try {
    const raw = await readFile(join(root!, 'blog/slugs.json'), 'utf8');
    const parsed = JSON.parse(raw) as { slugs?: string[] };
    const map: Record<string, number> = {};
    for (const slug of parsed.slugs ?? []) {
      if (slug) map[slug] = 1;
    }
    api.setPublishedBlogSlugsForTests(map);
  } catch {
    // Missing slugs.json → fail-open (null), matching CDK default.
    api.setPublishedBlogSlugsForTests(null);
  }
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function safeJoin(base: string, uri: string): string | null {
  const rel = uri.replace(/^\/+/, '');
  const full = normalize(join(base, rel));
  if (!full.startsWith(normalize(base))) return null;
  return full;
}

const handlersPromise = Promise.all([
  loadViewerRequestApi().then(async (api) => {
    await loadPublishedSlugs(api);
    return api;
  }),
  loadViewerResponseHandler(),
]);

const server = createServer(async (req, res) => {
  try {
    const [viewerRequestApi, viewerResponse] = await handlersPromise;
    // Refresh allowlist each request so local publisher rebuilds are visible.
    await loadPublishedSlugs(viewerRequestApi);
    const host = req.headers.host || `127.0.0.1:${port}`;
    const url = new URL(req.url || '/', `http://${host}`);
    const querystring: CfRequest['querystring'] = {};
    for (const [k, v] of url.searchParams) {
      querystring[k] = { value: v };
    }

    const rewritten = await viewerRequestApi.handler({
      request: {
        uri: url.pathname,
        querystring,
        headers: { host: { value: host } },
      },
    });

    if ('statusCode' in rewritten) {
      res.statusCode = rewritten.statusCode;
      const location = (
        rewritten as { headers?: { location?: { value: string } } }
      ).headers?.location?.value;
      if (location) res.setHeader('Location', location);
      res.end();
      return;
    }

    const filePath = safeJoin(root, rewritten.uri);
    if (!filePath) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = contentTypes[ext] || 'application/octet-stream';
    const isText =
      contentType.startsWith('text/') ||
      contentType.includes('json') ||
      contentType.includes('xml') ||
      contentType.includes('svg');

    let originResponse: CfResponse;
    try {
      const st = await stat(filePath);
      if (!st.isFile()) throw new Error('not a file');
      const body = await readFile(filePath);
      if (isText) {
        originResponse = {
          statusCode: 200,
          statusDescription: 'OK',
          headers: { 'content-type': { value: contentType } },
          body: body.toString('utf8'),
        };
      } else {
        // Binary assets are never rewritten by viewer-response; serve directly.
        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);
        res.end(body);
        return;
      }
    } catch {
      // Mirror S3 NoSuchKey XML so viewer-response can swap to HTML 404.
      originResponse = {
        statusCode: 404,
        statusDescription: 'Not Found',
        headers: {
          'content-type': { value: 'application/xml' },
        },
        body: `<Error><Code>NoSuchKey</Code><Key>${rewritten.uri}</Key></Error>`,
      };
    }

    const finalResponse = viewerResponse({
      request: { uri: rewritten.uri },
      response: originResponse,
    });

    res.statusCode = finalResponse.statusCode;
    for (const [name, header] of Object.entries(finalResponse.headers)) {
      res.setHeader(name, header.value);
    }
    res.end(finalResponse.body ?? '');
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(String(err));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.info(`[local-site] http://127.0.0.1:${port} root=${root}`);
  console.info(
    `[local-site] viewer-request ${pathToFileURL(viewerRequestPath).href}`,
  );
  console.info(
    `[local-site] viewer-response ${pathToFileURL(viewerResponsePath).href}`,
  );
});
