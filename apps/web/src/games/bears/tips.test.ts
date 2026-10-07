import { describe, expect, test } from 'vitest';
import { BEAR_TIPS, tipAtIndex, tipById, type BearTipId } from './tips';

describe('tips', () => {
  test('every tip has a Vermont Fish & Wildlife source URL', () => {
    expect(BEAR_TIPS.length).toBeGreaterThanOrEqual(6);
    for (const tip of BEAR_TIPS) {
      expect(tip.sourceUrl).toMatch(/^https:\/\/vtfishandwildlife\.com\//);
      expect(tip.title.length).toBeGreaterThan(0);
      expect(tip.body.length).toBeGreaterThan(0);
    }
  });

  test('every tip id has exactly one tip', () => {
    const ids: Record<BearTipId, true> = {
      'never-feed': true,
      'fed-bear': true,
      'bird-feeders': true,
      'secure-trash': true,
      'pet-food': true,
      campsite: true,
    };
    expect(BEAR_TIPS.map((t) => t.id).sort()).toEqual(Object.keys(ids).sort());
    for (const id of Object.keys(ids) as BearTipId[]) {
      expect(tipById(id).id).toBe(id);
    }
  });

  test('tipById and tipAtIndex find tips', () => {
    expect(tipById('never-feed').title).toBe('Never feed bears');
    expect(tipAtIndex(BEAR_TIPS.length).id).toBe(BEAR_TIPS[0]!.id);
    expect(tipAtIndex(-1).id).toBe(BEAR_TIPS[BEAR_TIPS.length - 1]!.id);
  });
});
