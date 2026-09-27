import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../src/concurrency.js';

describe('mapWithConcurrency', () => {
  it('preserves result order with a concurrency cap', async () => {
    const inFlight: number[] = [];
    let maxInFlight = 0;

    const results = await mapWithConcurrency(
      [10, 20, 30, 40, 50],
      2,
      async (n, index) => {
        inFlight.push(index);
        maxInFlight = Math.max(maxInFlight, inFlight.length);
        await new Promise((r) => setTimeout(r, 5));
        inFlight.splice(inFlight.indexOf(index), 1);
        return n * 2;
      },
    );

    expect(results).toEqual([20, 40, 60, 80, 100]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('returns empty for empty input', async () => {
    expect(await mapWithConcurrency([], 4, async (x) => x)).toEqual([]);
  });
});
