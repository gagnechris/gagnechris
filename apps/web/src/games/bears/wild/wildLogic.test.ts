import { describe, expect, test } from 'vitest';
import { SEASON_FOODS } from '../facts';
import {
  CAMP_FOOD_GAIN,
  COMFY_LIMIT,
  MAPLE_H,
  MAPLE_W,
  NO_INPUT,
  SNIFF_COOLDOWN_MS,
  START_FAT,
  STEP_MS,
  createWildState,
  currentLevel,
  isRevealed,
  levelSecondsLeft,
  sniffReady,
  stepWild,
  wildPaws,
  wildScore,
  wildTip,
  type WildEvent,
  type WildInput,
  type WildState,
} from './wildLogic';
import { FOOD_GAIN, GROUND_Y, WILD_LEVELS, type WildLevel } from './wildLevels';

const RIGHT: WildInput = { ...NO_INPUT, right: true };

function run(
  state: WildState,
  steps: number,
  input: WildInput | ((s: WildState, i: number) => WildInput) = NO_INPUT,
) {
  const events: WildEvent[] = [];
  let s = state;
  for (let i = 0; i < steps && s.phase === 'playing'; i++) {
    const r = stepWild(s, typeof input === 'function' ? input(s, i) : input);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** A state on a custom one-off level (plus the real summer after it). */
function onLevel(level: Partial<WildLevel>, x = 80): WildState {
  const custom: WildLevel = {
    ...WILD_LEVELS[0]!,
    solids: [],
    foods: [],
    camp: [],
    people: [],
    dogs: [],
    roads: [],
    ...level,
  };
  const base = createWildState([custom, ...WILD_LEVELS.slice(1)]);
  return { ...base, maple: { ...base.maple, x } };
}

describe('levels', () => {
  test('three seasons, in order, about 45 s each', () => {
    expect(WILD_LEVELS.map((l) => l.season)).toEqual([
      'spring',
      'summer',
      'fall',
    ]);
    for (const l of WILD_LEVELS) expect(l.timeMs).toBe(45_000);
  });

  test('every natural food is one the source names for that season (or insects)', () => {
    const allowed: Record<string, string[]> = {
      spring: ['greens'],
      summer: ['roots', 'berries'],
      fall: ['beechnuts', 'acorns', 'apples', 'berries'],
    };
    for (const level of WILD_LEVELS) {
      for (const food of level.foods) {
        expect([...allowed[level.season]!, 'insects']).toContain(food.kind);
      }
    }
    expect(SEASON_FOODS.find((s) => s.season === 'fall')!.foods).toContain(
      'beechnuts',
    );
  });

  test('beechnuts only appear in fall', () => {
    const withNuts = WILD_LEVELS.filter((l) =>
      l.foods.some((f) => f.kind === 'beechnuts'),
    );
    expect(withNuts.map((l) => l.season)).toEqual(['fall']);
  });
});

describe('movement', () => {
  test('Maple runs right and lands back on the ground after a jump', () => {
    let s = onLevel({});
    s = run(s, 30, RIGHT).state;
    expect(s.maple.x).toBeGreaterThan(200);
    s = stepWild(s, { ...RIGHT, jump: true }).state;
    expect(s.maple.onGround).toBe(false);
    s = run(s, 120).state;
    expect(s.maple.onGround).toBe(true);
    expect(s.maple.y).toBeCloseTo(GROUND_Y - MAPLE_H);
  });

  test('a log blocks Maple until she jumps over it', () => {
    const log = { x: 400, w: 150, h: 40, kind: 'log' as const };
    let s = run(onLevel({ solids: [log] }), 120, RIGHT).state;
    expect(s.maple.x + MAPLE_W).toBeLessThanOrEqual(log.x + 0.001);
    s = run(s, 90, (_, i) => ({ ...RIGHT, jump: i === 0 })).state;
    expect(s.maple.x).toBeGreaterThan(log.x + log.w);
  });

  test('Maple can land on top of a rock', () => {
    const rock = { x: 300, w: 300, h: 90, kind: 'rock' as const };
    let s = onLevel({ solids: [rock] }, 120);
    s = run(s, 40, (_, i) => ({ ...RIGHT, jump: i === 0 })).state;
    s = run(s, 30).state;
    expect(s.maple.onGround).toBe(true);
    expect(s.maple.y + MAPLE_H).toBeCloseTo(GROUND_Y - rock.h);
  });
});

describe('food', () => {
  test('natural food fills winter fat once', () => {
    const s0 = onLevel({
      foods: [{ id: 'b', kind: 'berries', x: 300, bottom: GROUND_Y }],
    });
    const { state, events } = run(s0, 120, RIGHT);
    expect(state.fat).toBe(START_FAT + FOOD_GAIN.berries);
    expect(state.naturalEaten).toBe(1);
    expect(events.filter((e) => e.type === 'eat')).toHaveLength(1);
  });

  test('hidden insects can only be eaten while Sniff reveals them', () => {
    const food = {
      id: 'i',
      kind: 'insects' as const,
      x: 150,
      bottom: GROUND_Y,
      hidden: true,
    };
    let s = onLevel({ foods: [food] }, 120);
    s = run(s, 5).state;
    expect(s.naturalEaten).toBe(0);
    expect(isRevealed(s, food.x)).toBe(false);
    const r = stepWild(s, { ...NO_INPUT, sniff: true });
    expect(r.events).toContainEqual({ type: 'sniff' });
    expect(r.state.naturalEaten).toBe(1);
  });

  test('Sniff has a cooldown', () => {
    let s = stepWild(onLevel({}), { ...NO_INPUT, sniff: true }).state;
    expect(sniffReady(s)).toBe(false);
    const again = stepWild(s, { ...NO_INPUT, sniff: true });
    expect(again.events).not.toContainEqual({ type: 'sniff' });
    s = run(s, Math.ceil(SNIFF_COOLDOWN_MS / STEP_MS) + 1).state;
    expect(sniffReady(s)).toBe(true);
  });
});

describe('campsite food', () => {
  test('a big boost, and Maple gets more comfortable with people', () => {
    const s0 = onLevel({ camp: [{ id: 't', kind: 'trash', x: 300 }] });
    const { state, events } = run(s0, 60, RIGHT);
    expect(state.fat).toBe(START_FAT + CAMP_FOOD_GAIN);
    expect(state.comfy).toBe(1);
    expect(events).toContainEqual({
      type: 'campSnack',
      kind: 'trash',
      comfy: 1,
    });
    expect(wildPaws(state)).toBe(2);
  });

  test('three campsite snacks always end the run', () => {
    const camp = [300, 500, 700].map((x, i) => ({
      id: `c${i}`,
      kind: 'trash' as const,
      x,
    }));
    const { state, events } = run(onLevel({ camp }), 400, RIGHT);
    expect(state.phase).toBe('habituated');
    expect(state.comfy).toBe(COMFY_LIMIT);
    expect(events[events.length - 1]).toEqual({
      type: 'end',
      phase: 'habituated',
    });
    expect(wildPaws(state)).toBe(0);
    expect(wildTip(state).id).toBe('fed-bear');
  });
});

describe('hazards', () => {
  test('a clapping camper pushes Maple back, then lets her pass', () => {
    const person = { id: 'p', x: 700 };
    const s0 = onLevel({ people: [person] });
    const { state, events } = run(s0, 300, RIGHT);
    expect(
      events.filter((e) => e.type === 'clap').length,
    ).toBeGreaterThanOrEqual(1);
    expect(state.maple.x).toBeGreaterThan(person.x);
  });

  test('a barking dog pushes Maple back', () => {
    const { events } = run(
      onLevel({ dogs: [{ id: 'd', x: 500 }] }),
      120,
      RIGHT,
    );
    expect(events).toContainEqual({ type: 'bark' });
  });

  test('stepping onto the road while a car passes sends Maple back to the edge', () => {
    const road = {
      id: 'r',
      x: 300,
      w: 200,
      periodMs: 100_000,
      carMs: 100_000,
    };
    const { state, events } = run(onLevel({ roads: [road] }), 60, RIGHT);
    expect(events).toContainEqual({ type: 'car' });
    expect(state.maple.x + MAPLE_W).toBeLessThanOrEqual(road.x);
  });
});

describe('levels and ending', () => {
  test('reaching the end of a level moves to the next season with a time bonus', () => {
    let state = onLevel({ length: 800 });
    const events: WildEvent[] = [];
    while (state.level === 0) {
      const r = stepWild(state, RIGHT);
      state = r.state;
      events.push(...r.events);
    }
    expect(events).toContainEqual({
      type: 'level',
      level: 0,
      reason: 'goal',
    });
    expect(state.level).toBe(1);
    expect(currentLevel(state).season).toBe('summer');
    expect(state.timeBonus).toBeGreaterThan(0);
    expect(state.maple.x).toBe(80);
  });

  test('running out of time moves on without a bonus', () => {
    const s0 = onLevel({ timeMs: 1_000 });
    const { state, events } = run(s0, 100);
    expect(events).toContainEqual({
      type: 'level',
      level: 0,
      reason: 'time',
    });
    expect(state.timeBonus).toBe(0);
    expect(levelSecondsLeft(state)).toBe(45);
  });

  test('finishing fall ends the run in the den', () => {
    const s0: WildState = { ...createWildState(), level: 2, levelT: 44_990 };
    const { state, events } = run(s0, 5);
    expect(state.phase).toBe('den');
    expect(events).toContainEqual({ type: 'end', phase: 'den' });
    expect(wildPaws(state)).toBe(3);
    expect(wildTip(state).id).toBe('never-feed');
  });

  test('score is winter fat × 10 plus the time bonus', () => {
    expect(wildScore({ ...createWildState(), fat: 64.4, timeBonus: 75 })).toBe(
      640 + 75,
    );
  });

  test('a run that only runs right finishes all three seasons', () => {
    const { state } = run(createWildState(), 60 * 60 * 3, (s) => ({
      ...RIGHT,
      jump: s.maple.onGround,
    }));
    expect(['den', 'habituated']).toContain(state.phase);
  });
});
