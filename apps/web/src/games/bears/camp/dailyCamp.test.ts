import { describe, expect, test } from 'vitest';
import {
  campResultLine,
  campShareText,
  campShortDate,
  dailyCampKey,
  dailyCampRngs,
  seededCampRngs,
} from './dailyCamp';

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

  test('result line summarizes the evening', () => {
    expect(
      campResultLine({
        key: '2026-10-03',
        paws: 2,
        saves: 4,
        score: 700,
        habituated: false,
      }),
    ).toBe(
      'Camp Rules 2026-10-03: 🐾🐾· made it to dark, 4 saves, score 700. https://gagnechris.com/dont-feed-the-bears/camp',
    );
    expect(
      campResultLine({
        key: '2026-10-03',
        paws: 0,
        saves: 0,
        score: 210,
        habituated: true,
      }),
    ).toContain('··· the bears got too comfortable');
  });

  test('share text is the short one-line summary', () => {
    expect(campShortDate('2026-10-04')).toBe('Oct 4');
    expect(campShareText({ key: '2026-10-04', seconds: 60, saves: 3 })).toBe(
      'Camp Rules · Oct 4 · held 60s, 3 saves',
    );
    expect(campShareText({ key: '2026-01-09', seconds: 17, saves: 1 })).toBe(
      'Camp Rules · Jan 9 · held 17s, 1 save',
    );
  });
});
