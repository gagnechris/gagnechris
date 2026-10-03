import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(REPO_ROOT, 'node_modules', '.bin');
const DYNAMODB_IMAGE = 'amazon/dynamodb-local:2.5.2';

export type Stack = {
  baseUrl: string;
  apiUrl: string;
  siteUrl: string;
  logDir: string;
  stop: () => Promise<void>;
};

function listen(server: Server): Promise<number> {
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') ok(address.port);
      else fail(new Error('no port'));
    });
  });
}

/**
 * Every port comes from env or the OS, so runs never collide with
 * `npm run local:dev` (8000/8787/4177/5173) or with each other. All probe
 * sockets stay open until every port is picked so the OS can't hand one out
 * twice.
 */
async function pickPorts<K extends string>(
  envNames: Record<K, string>,
): Promise<Record<K, number>> {
  const servers: Server[] = [];
  const ports = {} as Record<K, number>;
  try {
    for (const key of Object.keys(envNames) as K[]) {
      const fromEnv = process.env[envNames[key]]?.trim();
      if (fromEnv) {
        const port = Number(fromEnv);
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          throw new Error(`${envNames[key]}=${fromEnv} is not a port`);
        }
        ports[key] = port;
        continue;
      }
      const server = createServer();
      servers.push(server);
      ports[key] = await listen(server);
    }
  } finally {
    await Promise.all(
      servers.map((s) => new Promise<void>((ok) => s.close(() => ok()))),
    );
  }
  return ports;
}

async function waitFor(
  label: string,
  url: string,
  ok: (status: number) => boolean,
  logs: () => Promise<string>,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (ok(res.status)) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${label} not ready at ${url}\n${await logs()}`);
}

export async function startStack(): Promise<Stack> {
  const runId = `${process.pid}-${randomBytes(3).toString('hex')}`;
  const runDir = join(REPO_ROOT, 'e2e', '.stack', runId);
  const siteRoot = join(runDir, 'site');
  await mkdir(siteRoot, { recursive: true });

  const reuseDynamo = process.env.E2E_DYNAMODB_ENDPOINT?.trim();
  if (
    reuseDynamo &&
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(reuseDynamo)
  ) {
    throw new Error(`E2E_DYNAMODB_ENDPOINT must be local, got ${reuseDynamo}`);
  }
  const ports = await pickPorts({
    dynamodb: 'E2E_DYNAMODB_PORT',
    api: 'E2E_API_PORT',
    site: 'E2E_SITE_PORT',
    vite: 'E2E_VITE_PORT',
  });

  const dynamoEndpoint = reuseDynamo || `http://127.0.0.1:${ports.dynamodb}`;
  const apiUrl = `http://127.0.0.1:${ports.api}`;
  const siteUrl = `http://127.0.0.1:${ports.site}`;
  const baseUrl = `http://127.0.0.1:${ports.vite}`;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AWS_ACCESS_KEY_ID: 'local',
    AWS_SECRET_ACCESS_KEY: 'local',
    AWS_SESSION_TOKEN: '',
    AWS_REGION: 'us-east-1',
    AWS_DEFAULT_REGION: 'us-east-1',
    AWS_ENDPOINT_URL_DYNAMODB: dynamoEndpoint,
    DATA_TABLE_NAME: `gagnechris-e2e-${runId}`,
    SITE_STORAGE: 'filesystem',
    SITE_BUCKET_NAME: siteRoot,
    CLOUDFRONT_DISTRIBUTION_ID: 'local',
    SITE_APEX_DOMAIN: 'gagnechris.com',
    LOCAL_API_PORT: String(ports.api),
    LOCAL_SITE_PORT: String(ports.site),
    VITE_AUTH_MODE: 'local',
    VITE_LOCAL_API_ORIGIN: apiUrl,
    VITE_LOCAL_SITE_ORIGIN: siteUrl,
  };
  delete env.AWS_PROFILE;
  delete env.AWS_DEFAULT_PROFILE;
  delete env.VITE_API_TARGET;

  const children: ChildProcess[] = [];
  let container: string | undefined;

  const stop = async () => {
    for (const child of children) {
      if (child.pid && child.exitCode === null) {
        try {
          // Negative pid: tsx and Vite fork workers into the same group.
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          // Already gone.
        }
      }
    }
    if (container) {
      await run('docker', ['rm', '-f', container]).catch(() => undefined);
    }
    await rm(siteRoot, { recursive: true, force: true });
    if (!process.env.CI) await rm(runDir, { recursive: true, force: true });
  };

  const start = (
    name: string,
    cmd: string,
    args: string[],
    cwd = REPO_ROOT,
  ) => {
    const log = join(runDir, `${name}.log`);
    const out = createWriteStream(log);
    const child = spawn(cmd, args, {
      cwd,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.pipe(out);
    child.stderr?.pipe(out);
    children.push(child);
    return async () => {
      const text = await readFile(log, 'utf8').catch(() => '');
      return `--- ${name} log (${log}) ---\n${text.slice(-4000)}`;
    };
  };

  try {
    if (!reuseDynamo) {
      container = `gagnechris-e2e-${runId}`;
      await run('docker', [
        'run',
        '-d',
        '--rm',
        '--name',
        container,
        '--label',
        'gagnechris.e2e=1',
        '-p',
        `127.0.0.1:${ports.dynamodb}:8000`,
        DYNAMODB_IMAGE,
        '-jar',
        'DynamoDBLocal.jar',
        '-sharedDb',
        '-inMemory',
      ]);
      // DynamoDB Local answers a bare GET with 400 once it is listening.
      await waitFor(
        'DynamoDB Local',
        dynamoEndpoint,
        () => true,
        async () => '',
      );
    }

    await run(join(BIN, 'tsx'), ['scripts/local/bootstrap-table.ts'], {
      cwd: REPO_ROOT,
      env,
    });

    const dist = join(REPO_ROOT, 'apps', 'web', 'dist');
    if (existsSync(join(dist, '_shell.html'))) {
      await cp(dist, siteRoot, { recursive: true });
    } else {
      const shell = join(REPO_ROOT, 'scripts', 'local', 'minimal-shell.html');
      await copyFile(shell, join(siteRoot, 'index.html'));
      await copyFile(shell, join(siteRoot, '_shell.html'));
    }

    const apiLogs = start('api', join(BIN, 'tsx'), [
      'services/api/local/server.ts',
    ]);
    const siteLogs = start('site', join(BIN, 'tsx'), [
      'services/api/local/static-server.ts',
    ]);
    const viteLogs = start(
      'vite',
      join(BIN, 'vite'),
      ['--host', '127.0.0.1', '--port', String(ports.vite), '--strictPort'],
      join(REPO_ROOT, 'apps', 'web'),
    );

    await Promise.all([
      waitFor('local API', `${apiUrl}/api/health`, (s) => s === 200, apiLogs),
      waitFor('local site', `${siteUrl}/`, (s) => s < 500, siteLogs),
      waitFor('Vite', `${baseUrl}/admin`, (s) => s === 200, viteLogs),
    ]);
  } catch (err) {
    await stop();
    throw err;
  }

  return { baseUrl, apiUrl, siteUrl, logDir: runDir, stop };
}
