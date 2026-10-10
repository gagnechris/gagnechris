import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  fileURLToPath(new URL('../../../../..', import.meta.url)),
);

export type Claims = Record<string, string>;

// Bodies are whatever JSON the server sent; suites assert on their shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export type RequestOptions = {
  /** Authorizer claims; omitted means no token. */
  claims?: Claims;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
};

export type ApiResponse<T = Json> = {
  status: number;
  headers: Headers;
  /** Parsed JSON, the text of any other body, or undefined when empty. */
  body: T;
};

export type Api = {
  url: string;
  request<T = Json>(
    method: string,
    path: string,
    opts?: RequestOptions,
  ): Promise<ApiResponse<T>>;
  stop(): Promise<void>;
};

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
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

async function waitUntilServing(
  url: string,
  child: ChildProcess,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`API server exited with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`API server did not answer ${url}/api/health`);
}

export async function startApi(
  tableName: string,
  env: Record<string, string> = {},
): Promise<Api> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const bin = process.env.GO_API_BIN;
  if (!bin)
    throw new Error('GO_API_BIN is not set (the global setup builds it)');
  // Test claims mode: the server takes authorizer claims from X-Test-Claims.
  const child = spawn(bin, [], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      POWERTOOLS_LOG_LEVEL: 'ERROR',
      ...env,
      API_CLAIMS_MODE: 'test',
      DATA_TABLE_NAME: tableName,
      PORT: String(port),
    },
  });
  try {
    await waitUntilServing(url, child);
  } catch (err) {
    child.kill('SIGTERM');
    throw err;
  }

  return {
    url,
    async request(method, path, opts = {}) {
      const target = new URL(path, url);
      for (const [k, v] of Object.entries(opts.query ?? {})) {
        if (v !== undefined) target.searchParams.set(k, String(v));
      }
      const headers: Record<string, string> = { ...opts.headers };
      if (opts.claims) headers['x-test-claims'] = JSON.stringify(opts.claims);
      let body: string | undefined;
      if (opts.body !== undefined) {
        body =
          typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
        headers['content-type'] ??= 'application/json';
      }
      const res = await fetch(target, { method, headers, body });
      const text = await res.text();
      const isJson = res.headers.get('content-type')?.includes('json');
      return {
        status: res.status,
        headers: res.headers,
        body: text && isJson ? JSON.parse(text) : text || undefined,
      };
    },
    async stop() {
      if (child.exitCode != null) return;
      const exited = new Promise((r) => child.once('exit', r));
      child.kill('SIGTERM');
      await exited;
    },
  };
}
