import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  edgePipeline,
  loadViewerRequest,
  loadViewerResponse,
  type CfKvs,
  type CfQueryString,
  type OriginObject,
} from '@gagnechris/infra/cloudfront-harness';

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
const functionsDir = join(repoRoot, 'infra/lib/cloudfront');

const localKvsFile = process.env.LOCAL_KVS_FILE?.trim();

/**
 * The publisher writes the KVS keys to LOCAL_KVS_FILE locally. No file (or no
 * env) means no sentinel, so every slug fails open as before the first sync.
 */
const localKvs: CfKvs = {
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

/** `uri` under `base`, or null when it would escape it. */
function safeJoin(base: string, uri: string): string | null {
  const full = resolve(base, `.${uri.startsWith('/') ? '' : '/'}${uri}`);
  const rel = relative(resolve(base), full);
  return rel.startsWith('..') || isAbsolute(rel) ? null : full;
}

class Forbidden extends Error {}

async function readOrigin(uri: string): Promise<OriginObject | null> {
  const filePath = safeJoin(root!, uri);
  if (!filePath) throw new Forbidden(uri);
  const contentType =
    contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
  try {
    if (!(await stat(filePath)).isFile()) return null;
  } catch {
    return null;
  }
  const body = await readFile(filePath);
  const isText =
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('svg');
  return isText
    ? { kind: 'text', contentType, body: body.toString('utf8') }
    : { kind: 'binary', contentType, body };
}

const edge = edgePipeline({
  viewerRequest: loadViewerRequest({ kvs: localKvs, dir: functionsDir })
    .handler,
  viewerResponse: loadViewerResponse(functionsDir),
  origin: readOrigin,
});

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${port}`;
    const url = new URL(req.url || '/', `http://${host}`);
    const querystring: CfQueryString = {};
    for (const [k, v] of url.searchParams) {
      querystring[k] = { value: v };
    }

    const result = await edge({
      uri: url.pathname,
      querystring,
      headers: { host: { value: host } },
    });
    if (result.kind === 'binary') {
      res.statusCode = 200;
      res.setHeader('Content-Type', result.contentType);
      res.end(result.body);
      return;
    }
    const { response } = result;
    res.statusCode = response.statusCode;
    for (const [name, header] of Object.entries(response.headers ?? {})) {
      res.setHeader(name, header.value);
    }
    res.end(response.body ?? '');
  } catch (err) {
    if (err instanceof Forbidden) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    console.error(err);
    res.statusCode = 500;
    res.end(String(err));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.info(`[local-site] http://127.0.0.1:${port} root=${root}`);
  console.info(
    `[local-site] CloudFront functions ${pathToFileURL(functionsDir).href}`,
  );
  console.info(`[local-site] KVS ${localKvsFile ?? '(none: fail open)'}`);
});
