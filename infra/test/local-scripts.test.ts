import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { waitForDynamoDb } from '../../scripts/local/wait-dynamodb.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise((done) => s.close(done))),
  );
});

/** An HTTP server that fails `failures` requests with 500, then answers like DynamoDB. */
async function fakeDynamoDb(failures: number) {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests += 1;
    if (requests <= failures) {
      res.statusCode = 500;
      res.end('{}');
      return;
    }
    res.setHeader('content-type', 'application/x-amz-json-1.0');
    res.end(JSON.stringify({ TableNames: [] }));
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests: () => requests };
}

const closedPort = async () => {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  await new Promise((done) => server.close(done));
  return `http://127.0.0.1:${port}`;
};

describe('scripts/local/wait-dynamodb.ts', () => {
  it('resolves once DynamoDB Local answers ListTables', async () => {
    const ddb = await fakeDynamoDb(2);
    await waitForDynamoDb(ddb.url, { intervalMs: 10 });
    expect(ddb.requests()).toBe(3);
  });

  it('rejects when nothing answers before the timeout', async () => {
    await expect(
      waitForDynamoDb(await closedPort(), { timeoutMs: 200, intervalMs: 20 }),
    ).rejects.toThrow(/DynamoDB Local did not become ready/);
  });

  it('is the only DynamoDB readiness loop in CI and the local scripts', () => {
    const ci = parse(read('.github/workflows/ci.yml')) as {
      jobs: Record<string, { steps: { name?: string; run?: string }[] }>;
    };
    const wait = ci.jobs['api-integration']!.steps.find(
      (s) => s.name === 'Wait for DynamoDB Local',
    );
    expect(wait?.run).toBe(
      'npx tsx scripts/local/wait-dynamodb.ts http://127.0.0.1:8001',
    );
    const inlined = [
      ...readdirSync(join(ROOT, '.github/workflows')).map(
        (f) => `.github/workflows/${f}`,
      ),
      ...readdirSync(join(ROOT, 'scripts/local'))
        .filter((f) => f.endsWith('.sh'))
        .map((f) => `scripts/local/${f}`),
      'e2e/stack.ts',
      'services/api/test/integration/global-setup.ts',
    ].filter((path) => /ListTablesCommand/.test(read(path)));
    expect(inlined).toEqual([]);
  });
});

describe('scripts/local/lib.sh', () => {
  it('is what dev.sh waits with', () => {
    const dev = read('scripts/local/dev.sh');
    expect(dev).toContain('source "${ROOT}/scripts/local/lib.sh"');
    expect(dev).not.toMatch(/^(wait_http|wait_dynamodb)\(\)/m);
  });

  it('wait_http returns once the URL answers', async () => {
    const ddb = await fakeDynamoDb(0);
    // Async: the fake server answers on this process's event loop.
    const status = await new Promise<number | null>((done) => {
      spawn(
        'bash',
        ['-c', `source scripts/local/lib.sh && wait_http "${ddb.url}" fake`],
        { cwd: ROOT, stdio: 'ignore' },
      ).on('exit', done);
    });
    expect(status).toBe(0);
  });
});
