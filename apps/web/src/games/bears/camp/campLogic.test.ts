import { describe, expect, test } from 'vitest';
import {
  CAMP_ITEMS,
  NOISE_COOLDOWN_MS,
  ROUND_MS,
  STEP_MS,
  bearIntervalMs,
  bearSpeed,
  campPaws,
  campScore,
  campTip,
  createCampState,
  guestIntervalMs,
  makeNoise,
  mostLostItem,
  noiseReady,
  putAway,
  secondsLeft,
  stepCamp,
  type CampEvent,
  type CampItemKind,
  type CampRngs,
  type CampState,
} from './campLogic';
import { seededCampRngs } from './dailyCamp';

const ALL_KINDS = CAMP_ITEMS.map((i) => i.kind);

type Policy = (state: CampState) => CampState;

const idle: Policy = (s) => s;

const putAwayEverything: Policy = (s) =>
  ALL_KINDS.reduce((acc, kind) => putAway(acc, kind).state, s);

function play(
  rngs: CampRngs,
  policy: Policy,
  maxSteps = ROUND_MS / STEP_MS + 10,
): { state: CampState; events: CampEvent[]; schedule: string[] } {
  let state = createCampState();
  const events: CampEvent[] = [];
  const schedule: string[] = [];
  for (let i = 0; i < maxSteps && state.phase === 'playing'; i++) {
    state = policy(state);
    const result = stepCamp(state, rngs);
    state = result.state;
    events.push(...result.events);
    schedule.push(`${state.nextGuestAt}|${state.nextBearAt}`);
  }
  return { state, events, schedule };
}

function withBearHeadingFor(kind: CampItemKind): CampState {
  const state = createCampState();
  return {
    ...state,
    out: { ...state.out, [kind]: true },
    bears: [{ id: 'bear-x', x: 0, y: 50, target: kind, leaving: false }],
  };
}

describe('createCampState', () => {
  test('starts with trash, cooler, and pet food out and no snacks', () => {
    const s = createCampState();
    expect(ALL_KINDS.filter((k) => s.out[k])).toEqual([
      'trash',
      'cooler',
      'pet',
    ]);
    expect(s.snacks).toBe(0);
    expect(s.phase).toBe('playing');
    expect(secondsLeft(s)).toBe(60);
  });
});

describe('camp keeps coming undone', () => {
  test('putting everything away does not end the round', () => {
    const s = putAwayEverything(createCampState());
    expect(ALL_KINDS.every((k) => !s.out[k])).toBe(true);
    expect(s.phase).toBe('playing');
  });

  test('guests bring put-away items back out with a toast event', () => {
    const rngs = seededCampRngs(7);
    let s = putAwayEverything(createCampState());
    const events: CampEvent[] = [];
    while (s.t < 3_000) {
      const r = stepCamp(s, rngs);
      s = r.state;
      events.push(...r.events);
    }
    const guest = events.find((e) => e.type === 'guest');
    expect(guest).toBeDefined();
    expect(s.out[(guest as { kind: CampItemKind }).kind]).toBe(true);
  });

  test('guests and bears come faster as the evening goes on', () => {
    expect(guestIntervalMs(ROUND_MS, 0)).toBeLessThan(guestIntervalMs(0, 0));
    expect(bearIntervalMs(ROUND_MS, 0)).toBeLessThan(bearIntervalMs(0, 0));
    expect(bearSpeed(ROUND_MS)).toBeGreaterThan(bearSpeed(0));
  });

  test('an attentive player still has to keep acting all evening', () => {
    const { state, events } = play(seededCampRngs(42), putAwayEverything);
    expect(state.phase).toBe('dark');
    expect(state.snacks).toBe(0);
    const guestTimes = events.filter((e) => e.type === 'guest').length;
    expect(guestTimes).toBeGreaterThan(10);
  });
});

describe('snacks', () => {
  test('a bear reaching an item is one snack: item resets, bear leaves', () => {
    let s = withBearHeadingFor('cooler');
    const rngs = seededCampRngs(1);
    let snack: CampEvent | undefined;
    for (let i = 0; i < 200 && !snack; i++) {
      const r = stepCamp(s, rngs);
      s = r.state;
      snack = r.events.find((e) => e.type === 'snack' && e.kind === 'cooler');
    }
    expect(snack).toBeDefined();
    expect(s.snacks).toBeGreaterThanOrEqual(1);
    expect(s.lost.cooler).toBeGreaterThanOrEqual(1);
    expect(s.bears.find((b) => b.id === 'bear-x')?.leaving ?? true).toBe(true);
  });

  test('three snacks end the round: the bears got too comfortable', () => {
    const { state, events } = play(seededCampRngs(3), idle);
    expect(state.phase).toBe('habituated');
    expect(state.snacks).toBe(3);
    expect(state.t).toBeLessThan(ROUND_MS);
    expect(events[events.length - 1]).toEqual({
      type: 'end',
      phase: 'habituated',
    });
    expect(campPaws(state)).toBe(0);
  });

  test('stepping after the round ends changes nothing', () => {
    const { state } = play(seededCampRngs(3), idle);
    expect(stepCamp(state, seededCampRngs(3)).state).toBe(state);
  });
});

describe('putting away and saves', () => {
  test('putting away an item a bear is heading for is a save', () => {
    const r = putAway(withBearHeadingFor('grill'), 'grill');
    expect(r.state.saves).toBe(1);
    expect(r.state.out.grill).toBe(false);
    expect(r.state.bears[0]!.leaving).toBe(true);
    expect(r.events).toEqual([{ type: 'putAway', kind: 'grill', save: true }]);
  });

  test('putting away an untargeted item is not a save', () => {
    const r = putAway(createCampState(), 'trash');
    expect(r.state.saves).toBe(0);
    expect(r.events).toEqual([{ type: 'putAway', kind: 'trash', save: false }]);
  });

  test('items already put away ignore the action', () => {
    const s = createCampState();
    expect(putAway(s, 'feeder').state).toBe(s);
  });

  test('score is seconds × 10 + saves × 25', () => {
    const s = { ...createCampState(), t: 31_900, saves: 3 };
    expect(campScore(s)).toBe(31 * 10 + 3 * 25);
  });
});

describe('making noise', () => {
  test('sends the bear off and needs 6s to recharge', () => {
    const s = withBearHeadingFor('pet');
    expect(noiseReady(s)).toBe(true);
    const r = makeNoise(s, 'bear-x');
    expect(r.state.bears[0]!.leaving).toBe(true);
    expect(r.state.noiseReadyAt).toBe(s.t + NOISE_COOLDOWN_MS);
    expect(noiseReady(r.state)).toBe(false);
    expect(r.events).toEqual([{ type: 'noise' }]);

    const again = {
      ...r.state,
      bears: [{ id: 'bear-y', x: 0, y: 50, target: 'pet', leaving: false }],
    } satisfies CampState;
    expect(makeNoise(again, 'bear-y').state).toBe(again);
    expect(noiseReady({ ...again, t: again.noiseReadyAt })).toBe(true);
  });
});

describe('end of round', () => {
  test('surviving to 60s is dark; paws are 3 minus snacks', () => {
    const s: CampState = {
      ...createCampState(),
      t: ROUND_MS - STEP_MS,
      nextGuestAt: Infinity,
      nextBearAt: Infinity,
      snacks: 1,
    };
    const r = stepCamp(s, seededCampRngs(1));
    expect(r.state.phase).toBe('dark');
    expect(r.events).toContainEqual({ type: 'end', phase: 'dark' });
    expect(campPaws(r.state)).toBe(2);
    expect(secondsLeft(r.state)).toBe(0);
  });

  test('the tip matches the item that cost the most', () => {
    const base = createCampState();
    const lost = (l: Partial<CampState['lost']>) => ({
      ...base,
      lost: { ...base.lost, ...l },
    });
    expect(campTip(base).id).toBe('never-feed');
    expect(campTip(lost({ trash: 2, pet: 1 })).id).toBe('secure-trash');
    expect(campTip(lost({ feeder: 1 })).id).toBe('bird-feeders');
    expect(campTip(lost({ cooler: 1 })).id).toBe('campsite');
    expect(campTip(lost({ grill: 2 })).id).toBe('campsite');
    expect(campTip(lost({ pet: 3, trash: 1 })).id).toBe('pet-food');
  });

  test('ties go to the earlier item', () => {
    const base = createCampState();
    expect(
      mostLostItem({ ...base, lost: { ...base.lost, cooler: 1, trash: 1 } }),
    ).toBe('trash');
  });
});

describe('daily camp determinism', () => {
  test('the same seed replays the same evening', () => {
    const a = play(seededCampRngs(20261003), idle);
    const b = play(seededCampRngs(20261003), idle);
    expect(b.events).toEqual(a.events);
    expect(b.state).toEqual(a.state);
  });

  test('the guest and bear schedule does not depend on the player', () => {
    const lazy = play(seededCampRngs(99), idle, 200);
    const busy = play(seededCampRngs(99), putAwayEverything, 200);
    const n = Math.min(lazy.schedule.length, busy.schedule.length);
    expect(n).toBeGreaterThan(50);
    expect(busy.schedule.slice(0, n)).toEqual(lazy.schedule.slice(0, n));
  });
});
