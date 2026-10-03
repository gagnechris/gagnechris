import { describe, expect, test } from 'vitest';
import { SEASON_FOODS } from '../facts';
import {
  CAMP_FOOD_GAIN,
  COMFY_LIMIT,
  DOG_RANGE,
  JUMP_SPEED,
  GRAVITY,
  PERSON_CYCLE,
  PERSON_RANGE,
  MAPLE_H,
  MAPLE_W,
  NO_INPUT,
  SNIFF_COOLDOWN_MS,
  START_FAT,
  STEP_MS,
  createWildState,
  currentLevel,
  dogAwake,
  onHighRoute,
  personWatching,
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
    platforms: [],
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
    expect(events.filter((e) => e.type === 'eat')).toEqual([
      {
        type: 'eat',
        kind: 'berries',
        gain: FOOD_GAIN.berries,
        x: 328,
        y: GROUND_Y - 20,
      },
    ]);
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
      x: 300 + 26,
      y: GROUND_Y - 31,
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

// A camper with this offset is watching from t = 0; with 0 they're busy at first.
const WATCHING_NOW = PERSON_CYCLE.periodMs - PERSON_CYCLE.activeMs;

describe('campers and dogs', () => {
  test('campers alternate between busy and watching; dogs between napping and awake', () => {
    expect(personWatching(0)).toBe(false);
    expect(personWatching(0, WATCHING_NOW)).toBe(true);
    expect(personWatching(PERSON_CYCLE.periodMs - 1)).toBe(true);
    expect(dogAwake(0)).toBe(false);
  });

  test('Maple can slip past a busy camper', () => {
    const person = { id: 'p', x: 500 };
    const { state, events } = run(onLevel({ people: [person] }), 120, RIGHT);
    expect(events).not.toContainEqual({ type: 'clap' });
    expect(state.maple.x).toBeGreaterThan(person.x + PERSON_RANGE);
  });

  test('a watching camper claps and pushes Maple back', () => {
    const person = { id: 'p', x: 500, offsetMs: WATCHING_NOW };
    const { state, events } = run(onLevel({ people: [person] }), 45, RIGHT);
    expect(events).toContainEqual({ type: 'clap' });
    expect(state.maple.x + MAPLE_W / 2).toBeLessThan(person.x);
  });

  test('waiting for the camper to look away gets Maple past', () => {
    const person = { id: 'p', x: 700, offsetMs: WATCHING_NOW };
    const { state } = run(onLevel({ people: [person] }), 600, (s) => ({
      ...NO_INPUT,
      right: !personWatching(s.levelT, person.offsetMs),
    }));
    expect(state.maple.x).toBeGreaterThan(person.x + PERSON_RANGE);
  });

  test('a napping dog lets Maple by; an awake one barks', () => {
    const asleep = run(onLevel({ dogs: [{ id: 'd', x: 400 }] }), 90, RIGHT);
    expect(asleep.events).not.toContainEqual({ type: 'bark' });
    expect(asleep.state.maple.x).toBeGreaterThan(400 + DOG_RANGE);

    const awake = run(
      onLevel({ dogs: [{ id: 'd', x: 400, offsetMs: 2_700 }] }),
      90,
      RIGHT,
    );
    expect(awake.events).toContainEqual({ type: 'bark' });
  });

  test('Maple gets one hint as she approaches each camper and dog', () => {
    const { events } = run(
      onLevel({ people: [{ id: 'p', x: 900 }], dogs: [{ id: 'd', x: 1300 }] }),
      400,
      RIGHT,
    );
    expect(events.filter((e) => e.type === 'warn')).toEqual([
      { type: 'warn', who: 'person' },
      { type: 'warn', who: 'dog' },
    ]);
  });
});

describe('the high route', () => {
  const step = { x: 300, w: 150, h: 40, kind: 'log' as const };
  const ledge = { x: 420, w: 700, top: 150 };

  test('Maple walks under a high log without bumping into it', () => {
    const { state } = run(onLevel({ platforms: [ledge] }), 260, RIGHT);
    expect(state.maple.x).toBeGreaterThan(ledge.x + ledge.w);
    expect(state.maple.onGround).toBe(true);
  });

  test('it is too high to jump onto from the ground, but a step log reaches it', () => {
    const fromGround = run(
      onLevel({ platforms: [ledge] }, 360),
      80,
      (_, i) => ({ ...RIGHT, jump: i === 0 }),
    ).state;
    expect(onHighRoute(fromGround.maple)).toBe(false);

    const maxJump = JUMP_SPEED ** 2 / (2 * GRAVITY);
    expect(maxJump).toBeLessThan(ledge.top);
    expect(step.h + maxJump).toBeGreaterThan(ledge.top);
  });

  test('up high, a watching camper and dog ignore Maple, and she skips the campsite food', () => {
    const level = {
      solids: [step],
      platforms: [ledge],
      camp: [{ id: 't', kind: 'trash' as const, x: 650 }],
      people: [{ id: 'p', x: 800, offsetMs: WATCHING_NOW }],
      dogs: [{ id: 'd', x: 950, offsetMs: 2_700 }],
    };
    // Stand on the step, jump up onto the log, then walk along it.
    const start = onLevel(level, 320);
    let s: WildState = {
      ...start,
      maple: { ...start.maple, y: GROUND_Y - step.h - MAPLE_H },
    };
    s = run(s, 10).state;
    s = run(s, 60, (_, i) => ({ ...RIGHT, jump: i === 0 })).state;
    expect(onHighRoute(s.maple)).toBe(true);
    const { state, events } = run(s, 160, RIGHT);
    expect(events).not.toContainEqual({ type: 'clap' });
    expect(events).not.toContainEqual({ type: 'bark' });
    expect(state.campSnacks).toBe(0);
    expect(state.maple.x).toBeGreaterThan(ledge.x + ledge.w - MAPLE_W);
  });

  test('every campsite in the game has a reachable high log that covers it', () => {
    const maxJump = JUMP_SPEED ** 2 / (2 * GRAVITY);
    for (const level of WILD_LEVELS) {
      const watchers = [
        ...level.people.map((p) => ({ x: p.x, range: PERSON_RANGE })),
        ...level.dogs.map((d) => ({ x: d.x, range: DOG_RANGE })),
      ];
      for (const w of watchers) {
        const ledgeOver = level.platforms.find(
          (p) =>
            p.x <= w.x - w.range && p.x + p.w >= w.x + w.range - MAPLE_W / 2,
        );
        expect(ledgeOver, `${level.season} watcher at ${w.x}`).toBeDefined();
        const stepUp = level.solids.find(
          (s) =>
            s.x + s.w >= ledgeOver!.x - 40 &&
            s.x <= ledgeOver!.x + 40 &&
            s.h + maxJump > ledgeOver!.top,
        );
        expect(
          stepUp,
          `${level.season} step to ledge at ${ledgeOver!.x}`,
        ).toBeDefined();
      }
      for (const c of level.camp) {
        expect(
          level.platforms.some((p) => p.x <= c.x && p.x + p.w >= c.x + 52),
          `${level.season} camp food at ${c.x}`,
        ).toBe(true);
      }
    }
  });
});

describe('roads', () => {
  test('stepping onto the road while a car passes sends Maple back to the edge', () => {
    const road = { id: 'r', x: 300, w: 200, periodMs: 100_000, carMs: 100_000 };
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
