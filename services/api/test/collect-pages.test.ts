import { describe, expect, it, vi } from 'vitest';
import { collectPages } from '../src/data/collect-pages.js';

const pages: Record<string, { items: number[]; nextCursor?: string }> = {
  start: { items: [1, 2, 3], nextCursor: 'b' },
  b: { items: [4, 5], nextCursor: 'c' },
  c: { items: [6] },
};

describe('collectPages', () => {
  it('reads every page when under the cap', async () => {
    const fetch = vi.fn(async (cursor?: string) => pages[cursor ?? 'start']!);
    expect(await collectPages(fetch, 100)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual([undefined, 'b', 'c']);
  });

  it('stops reading once the cap is reached and trims to it', async () => {
    const fetch = vi.fn(async (cursor?: string) => pages[cursor ?? 'start']!);
    expect(await collectPages(fetch, 4)).toEqual([1, 2, 3, 4]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('counts only kept items toward the cap', async () => {
    const fetch = vi.fn(async (cursor?: string) => pages[cursor ?? 'start']!);
    expect(await collectPages(fetch, 2, (n) => n % 2 === 0)).toEqual([2, 4]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
