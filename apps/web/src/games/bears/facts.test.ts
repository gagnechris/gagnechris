import { describe, expect, test } from 'vitest';
import {
  BEAR_FACTS,
  CAMP_ITEM_ACTIONS,
  SEASON_FOODS,
  type BearFact,
} from './facts';

const VT_FW = /^https:\/\/vtfishandwildlife\.com\//;

const allFacts: BearFact[] = [
  ...SEASON_FOODS.map((s) => s.fact),
  ...Object.values(BEAR_FACTS),
  ...Object.values(CAMP_ITEM_ACTIONS),
];

describe('facts', () => {
  test('every fact has text and a Vermont Fish & Wildlife source', () => {
    for (const fact of allFacts) {
      expect(fact.text.length).toBeGreaterThan(0);
      expect(fact.sourceUrl).toMatch(VT_FW);
    }
  });

  test('fact ids are unique', () => {
    const ids = allFacts.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('seasons run spring, summer, fall and each names foods', () => {
    expect(SEASON_FOODS.map((s) => s.season)).toEqual([
      'spring',
      'summer',
      'fall',
    ]);
    for (const s of SEASON_FOODS) {
      expect(s.foods.length).toBeGreaterThan(0);
    }
  });

  test('beechnuts are a fall food, not summer', () => {
    const bySeason = Object.fromEntries(
      SEASON_FOODS.map((s) => [s.season, s.foods]),
    );
    expect(bySeason.fall).toContain('beechnuts');
    expect(bySeason.summer).not.toContain('beechnuts');
  });
});
