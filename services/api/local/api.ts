// The Go API for the local stack and the e2e stack: Go on a private port,
// with a front server on LOCAL_API_PORT that runs the site hooks (media
// CORS, publisher rebuild) prod gets from AWS. Local Bearer tokens.
//
// GO_API_BIN names a prebuilt binary; otherwise each run builds one.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer as createHttpServer, request } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maybeRebuild, mediaCors } from './site-hooks.js';

const repoRoot = path.resolve(
  fileURLToPath(new URL('../../..', import.meta.url)),
);
const port = process.env.LOCAL_API_PORT || '8787';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function waitForHealth(url: string, child: ChildProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`${url} exited`);
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${url}/api/health did not answer`);
}

const binDir = mkdtempSync(path.join(tmpdir(), 'gagnechris-go-api-'));
const children: ChildProcess[] = [];

function shutdown(code: number): never {
  for (const child of children) child.kill('SIGTERM');
  rmSync(binDir, { recursive: true, force: true });
  process.exit(code);
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

const bin = process.env.GO_API_BIN || path.join(binDir, 'api');
if (!process.env.GO_API_BIN) {
  const build = spawnSync('go', ['-C', 'go', 'build', '-o', bin, './cmd/api'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (build.status !== 0) shutdown(1);
}

const goPort = String(await freePort());
const go = spawn(bin, [], {
  cwd: repoRoot,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, PORT: goPort, API_CLAIMS_MODE: 'local' },
});
children.push(go);
go.on('exit', (code) => shutdown(code ?? 1));
await waitForHealth(`http://127.0.0.1:${goPort}`, go);

createHttpServer(async (req, res) => {
  try {
    if (mediaCors(req, res)) return;
    const body = await readBody(req);
    const upstream = await new Promise<{
      status: number;
      headers: Record<string, string | string[] | undefined>;
      body: Buffer;
    }>((resolve, reject) => {
      const out = request(
        {
          host: '127.0.0.1',
          port: goPort,
          method: req.method,
          path: req.url,
          headers: req.headers,
        },
        async (upRes) => {
          resolve({
            status: upRes.statusCode ?? 502,
            headers: upRes.headers,
            body: await readBody(upRes),
          });
        },
      );
      out.on('error', reject);
      out.end(body);
    });
    const pathname = new URL(req.url || '/', 'http://local').pathname;
    // Await rebuild before responding so publish/edit callers see fresh HTML.
    await maybeRebuild(req.method || 'GET', pathname, upstream.status);
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (value !== undefined && key !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    }
    res.statusCode = upstream.status;
    res.end(upstream.body);
  } catch (err) {
    console.error(err);
    res.statusCode = 502;
    res.end();
  }
}).listen(Number(port), '127.0.0.1');
