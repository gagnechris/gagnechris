// The Go API in front of the Node one: Go serves the routes it has and
// proxies the rest to a Node server on a private port.
//
//   tsx services/api/local/go-api.ts test   # HTTP suite: PORT, X-Test-Claims
//   tsx services/api/local/go-api.ts local  # local stack: LOCAL_API_PORT, local tokens
//
// GO_API_BIN names a prebuilt binary; otherwise each run builds one. Build
// once first when starting many servers at a time, as the HTTP suite does.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLocalAuthEnv } from './claims.js';

const repoRoot = path.resolve(
  fileURLToPath(new URL('../../..', import.meta.url)),
);

const MODES = {
  test: { server: 'services/api/local/test-server.ts', portEnv: 'PORT' },
  local: { server: 'services/api/local/server.ts', portEnv: 'LOCAL_API_PORT' },
} as const;

const mode = process.argv[2];
if (mode !== 'test' && mode !== 'local') {
  throw new Error('Usage: go-api.ts test|local');
}
const { server, portEnv } = MODES[mode];
const port = process.env[portEnv] || (mode === 'local' ? '8787' : '');
if (!port) throw new Error(`${portEnv} is not set`);
if (mode === 'local') applyLocalAuthEnv();

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

const children: ChildProcess[] = [];
const binDir = mkdtempSync(path.join(tmpdir(), 'gagnechris-go-api-'));

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

const nodePort = await freePort();
const nodeUrl = `http://127.0.0.1:${nodePort}`;
const node = spawn(process.execPath, ['--import', 'tsx', server], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, [portEnv]: String(nodePort) },
});
children.push(node);
node.on('exit', (code) => shutdown(code ?? 1));
await waitForHealth(nodeUrl, node);

const go = spawn(bin, [], {
  cwd: repoRoot,
  stdio: ['ignore', mode === 'test' ? 'ignore' : 'inherit', 'inherit'],
  env: {
    ...process.env,
    PORT: port,
    API_CLAIMS_MODE: mode,
    API_FALLBACK_URL: nodeUrl,
  },
});
children.push(go);
go.on('exit', (code) => shutdown(code ?? 1));
