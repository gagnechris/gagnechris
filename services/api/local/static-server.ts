import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.LOCAL_SITE_PORT || 4177);
const root = process.env.SITE_BUCKET_NAME;
if (!root) {
  throw new Error('SITE_BUCKET_NAME (local site root) is required');
}

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (
      existsSync(join(dir, 'package.json')) &&
      existsSync(join(dir, 'infra'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Could not find monorepo root from static-server');
    }
    dir = parent;
  }
}

const repoRoot = process.env.REPO_ROOT?.trim() || findRepoRoot(__dirname);
const viewerRequestPath = join(
  repoRoot,
  'infra/lib/cloudfront/viewer-request-function.js',
);
const viewerResponsePath = join(
  repoRoot,
  'infra/lib/cloudfront/viewer-response-function.js',
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

type ViewerRequestHandler = (event: {
  request: CfRequest;
}) => Promise<CfRequest | CfResponse>;

const localKvsFile = process.env.LOCAL_KVS_FILE?.trim();

/**
 * The publisher writes the KVS keys to LOCAL_KVS_FILE locally. No file (or no
 * env) means no sentinel, so every slug fails open as before the first sync.
 */
const localKvs = {
  async exists(key: string): Promise<boolean> {
    if (!localKvsFile) return false;
    try {
      const parsed = JSON.parse(await readFile(localKvsFile, 'utf8')) as {
        keys?: string[];
      };
      return (parsed.keys ?? []).includes(key);
    } catch {
      return false;
    }
  },
};

async function loadViewerRequestHandler(): Promise<ViewerRequestHandler> {
  const source = (await readFile(viewerRequestPath, 'utf8')).replace(
    /import cf from 'cloudfront';\s*/g,
    '',
  );
  return new Function(
    '__kvs',
    `var cf = { kvs: function () { return __kvs; } };
     ${source}
     return handler;`,
  )(localKvs) as ViewerRequestHandler;
}

async function loadViewerResponseHandler(): Promise<
  (event: { request: { uri: string }; response: CfResponse }) => CfResponse
> {
  const source = await readFile(viewerResponsePath, 'utf8');
  return new Function(`${source}\nreturn handler;`)() as (event: {
    request: { uri: string };
    response: CfResponse;
  }) => CfResponse;
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
  loadViewerRequestHandler(),
  loadViewerResponseHandler(),
]);

const server = createServer(async (req, res) => {
  try {
    const [viewerRequest, viewerResponse] = await handlersPromise;
    const host = req.headers.host || `127.0.0.1:${port}`;
    const url = new URL(req.url || '/', `http://${host}`);
    const querystring: CfRequest['querystring'] = {};
    for (const [k, v] of url.searchParams) {
      querystring[k] = { value: v };
    }

    const rewritten = await viewerRequest({
      request: {
        uri: url.pathname,
        querystring,
        headers: { host: { value: host } },
      },
    });

    if ('statusCode' in rewritten) {
      res.statusCode = rewritten.statusCode;
      for (const [name, header] of Object.entries(rewritten.headers ?? {})) {
        res.setHeader(name, header.value);
      }
      res.end(rewritten.body ?? '');
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
      // S3's NoSuchKey. CloudFront never runs viewer-response on an origin
      // 4xx, so neither does this.
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/xml');
      res.end(
        `<Error><Code>NoSuchKey</Code><Key>${rewritten.uri}</Key></Error>`,
      );
      return;
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
  console.info(`[local-site] KVS ${localKvsFile ?? '(none: fail open)'}`);
});
