import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAJOR = 22;

type Version = [number, number, number];

const parse = (v: string): Version => {
  const [a = 0, b = 0, c = 0] = v.split('.').map((n) => Number(n) || 0);
  return [a, b, c];
};
const cmp = (a: Version, b: Version) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** The lowest Node `MAJOR`.x.y an engines range accepts, or undefined if none. */
function lowestOnMajor(range: string): Version | undefined {
  let best: Version | undefined;
  for (const alt of range.split('||')) {
    let low: Version = [MAJOR, 0, 0];
    let ok = true;
    const comparators = alt
      .trim()
      .replace(/(>=|<=|>|<|\^|~|=)\s+/g, '$1')
      .split(/\s+/);
    for (const c of comparators) {
      const m = /^(>=|<=|>|<|\^|~|=)?v?(\d+(?:\.(?:\d+|x|\*))*)$/.exec(c);
      if (c === '' || c === '*' || c === 'x') continue;
      if (!m) {
        ok = false;
        break;
      }
      const op = m[1] ?? '=';
      const v = parse(m[2]!);
      if (op === '>=' || op === '>') {
        if (v[0] > MAJOR) ok = false;
        else if (v[0] === MAJOR && cmp(v, low) > 0) low = v;
      } else if (op === '<' || op === '<=') {
        if (v[0] <= MAJOR && !(v[0] === MAJOR && cmp(v, low) > 0)) ok = false;
      } else if (v[0] !== MAJOR) {
        ok = false;
      } else if (cmp(v, low) > 0) {
        low = v;
      }
    }
    if (ok && (!best || cmp(low, best) < 0)) best = low;
  }
  return best;
}

describe('Node engines floor', () => {
  it('reads the lowest accepted version of a major', () => {
    expect(lowestOnMajor('^22.22.2 || ^24.15.0 || >=26.0.0')).toEqual([
      22, 22, 2,
    ]);
    expect(lowestOnMajor('>=18')).toEqual([22, 0, 0]);
    expect(lowestOnMajor('>= 22.19.0')).toEqual([22, 19, 0]);
    expect(lowestOnMajor('>=24.0.0')).toBeUndefined();
  });

  it('is at least what every locked package needs, since .npmrc sets engine-strict', () => {
    const lock = JSON.parse(
      readFileSync(join(ROOT, 'package-lock.json'), 'utf8'),
    ) as {
      packages: Record<
        string,
        { engines?: { node?: string } | string[]; optional?: boolean }
      >;
    };
    const nodeRange = (e: (typeof lock.packages)[string] | undefined) =>
      e?.engines && !Array.isArray(e.engines) ? e.engines.node : undefined;
    const pkg = JSON.parse(
      readFileSync(join(ROOT, 'package.json'), 'utf8'),
    ) as { engines: { node: string } };
    expect(nodeRange(lock.packages[''])).toBe(pkg.engines.node);
    const root = lowestOnMajor(pkg.engines.node)!;
    const tooLow: string[] = [];
    for (const [path, entry] of Object.entries(lock.packages)) {
      const range = nodeRange(entry);
      if (!path || entry.optional || !range) continue;
      const need = lowestOnMajor(range);
      if (need && cmp(need, root) > 0) tooLow.push(`${path} needs ${range}`);
    }
    expect(tooLow).toEqual([]);
  });
});
