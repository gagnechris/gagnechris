/**
 * Local static origin that applies the real CloudFront viewer-request function
 * before serving files from SITE_BUCKET_NAME (.local-site).
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

const viewerPath = join(
  __dirname,
  '../../../infra/lib/cloudfront/viewer-request-function.js',
);

type CfRequest = {
  uri: string;
  querystring?: Record<string, { value?: string }>;
  headers: { host: { value: string } };
};

async function loadViewerHandler(): Promise<
  (event: { request: CfRequest }) => CfRequest | { statusCode: number }
> {
  const source = await readFile(viewerPath, 'utf8');
  // eslint-disable-next-line no-new-func -- intentional: load CF Function source
  return new Function(`${source}\nreturn handler;`)() as (
    event: { request: CfRequest },
  ) => CfRequest | { statusCode: number };
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

const handlerPromise = loadViewerHandler();

const server = createServer(async (req, res) => {
  try {
    const handler = await handlerPromise;
    const host = req.headers.host || `127.0.0.1:${port}`;
    const url = new URL(req.url || '/', `http://${host}`);
    const querystring: CfRequest['querystring'] = {};
    for (const [k, v] of url.searchParams) {
      querystring[k] = { value: v };
    }

    const rewritten = handler({
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

    try {
      const st = await stat(filePath);
      if (!st.isFile()) throw new Error('not a file');
      const body = await readFile(filePath);
      res.statusCode = 200;
      res.setHeader(
        'Content-Type',
        contentTypes[extname(filePath).toLowerCase()] ||
          'application/octet-stream',
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`NoSuchKey: ${rewritten.uri}`);
    }
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(String(err));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.info(`[local-site] http://127.0.0.1:${port} root=${root}`);
  console.info(`[local-site] viewer-request ${pathToFileURL(viewerPath).href}`);
});
