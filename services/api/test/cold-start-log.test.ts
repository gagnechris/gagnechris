import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeEvent } from './support/make-event.js';

afterEach(() => {
  vi.restoreAllMocks();
});

async function requestLogs(calls: number): Promise<Record<string, unknown>[]> {
  vi.resetModules();
  const { handler } = await import('../src/handler.js');
  const lines: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  for (let i = 0; i < calls; i++) {
    await handler(
      makeEvent('GET', '/api/health'),
      {} as never,
      () => undefined,
    );
  }
  return lines
    .flatMap((l) => l.split('\n'))
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((l) => l.message === 'request');
}

describe('cold-start request log', () => {
  it('records bundle load time on the first request only', async () => {
    const [first, second] = await requestLogs(2);
    expect(first!.bundleReadyMs).toEqual(expect.any(Number));
    expect(first!.bundleReadyMs as number).toBeGreaterThan(0);
    expect(second).toBeDefined();
    expect(second!).not.toHaveProperty('bundleReadyMs');
  });
});
