import { describe, expect, test } from 'vitest';
import { dailyCampKey, dailyCampRngs, seededCampRngs } from './dailyCamp';

const draw = (rng: () => number, n = 5) =>
  Array.from({ length: n }, () => rng());

describe('dailyCamp', () => {
  test('keys use the local calendar date', () => {
    expect(dailyCampKey(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03');
    expect(dailyCampKey(new Date(2026, 0, 9, 0, 1))).toBe('2026-01-09');
  });

  test('the same date gives the same streams', () => {
    const a = dailyCampRngs('2026-10-03');
    const b = dailyCampRngs('2026-10-03');
    expect(draw(b.schedule)).toEqual(draw(a.schedule));
    expect(draw(b.choice)).toEqual(draw(a.choice));
  });

  test('different dates and the two streams differ', () => {
    const today = dailyCampRngs('2026-10-03');
    const tomorrow = dailyCampRngs('2026-10-04');
    expect(draw(tomorrow.schedule)).not.toEqual(draw(today.schedule));
    const s = seededCampRngs(1);
    expect(draw(s.choice)).not.toEqual(draw(seededCampRngs(1).schedule));
  });
});
