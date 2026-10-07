import { describe, expect, test } from 'vitest';
import { createCampState, type CampState } from './campLogic';
import {
  campResult,
  campShortDate,
  formatCampResult,
  type CampResult,
} from './campResult';

const result = (r: Partial<CampResult> = {}): CampResult => ({
  key: '2026-10-03',
  seconds: 60,
  saves: 4,
  score: 700,
  paws: 2,
  habituated: false,
  ...r,
});

describe('campResult', () => {
  test('reads the result off the final state', () => {
    const final: CampState = {
      ...createCampState(),
      phase: 'dark',
      t: 60_000,
      saves: 4,
      snacks: 1,
    };
    expect(campResult(final, '2026-10-03')).toEqual(result());
  });

  test('copy line summarizes the evening with paws and the link', () => {
    expect(formatCampResult(result()).copy).toBe(
      'Camp Rules 2026-10-03: 🐾🐾· made it to dark, 4 saves, score 700. https://gagnechris.com/dont-feed-the-bears/camp',
    );
    expect(
      formatCampResult(
        result({ paws: 0, saves: 0, score: 210, habituated: true }),
      ).copy,
    ).toContain('··· the bears got too comfortable');
  });

  test('share text is the short one-line summary', () => {
    expect(campShortDate('2026-10-04')).toBe('Oct 4');
    expect(
      formatCampResult(result({ key: '2026-10-04', seconds: 60, saves: 3 }))
        .share,
    ).toBe('Camp Rules · Oct 4 · held 60s, 3 saves');
    expect(
      formatCampResult(result({ key: '2026-01-09', seconds: 17, saves: 1 }))
        .share,
    ).toBe('Camp Rules · Jan 9 · held 17s, 1 save');
  });

  test('the end card summary', () => {
    expect(
      formatCampResult(result({ seconds: 17, saves: 1, score: 195 })).summary,
    ).toBe('17s · 1 save · score 195');
  });
});
