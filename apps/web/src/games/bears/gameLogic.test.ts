import { describe, expect, test } from 'vitest';
import {
  allAttractantsSecured,
  createInitialState,
  createSeededRng,
  DEFAULT_ROUND_DURATION_MS,
  secureAttractant,
  selectTip,
  selectTipByRound,
  spawnIntervalForProgress,
  tick,
  unsecuredAttractants,
  type GameState,
} from './gameLogic';
import { BEAR_TIPS } from './tips';

function playUntil(
  start: GameState,
  predicate: (s: GameState) => boolean,
  opts: {
    rng: () => number;
    maxTicks?: number;
    deltaMs?: number;
    speedScale?: number;
  },
): GameState {
  let state = start;
  const maxTicks = opts.maxTicks ?? 5_000;
  const deltaMs = opts.deltaMs ?? 100;
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(state)) return state;
    state = tick(state, deltaMs, {
      rng: opts.rng,
      speedScale: opts.speedScale,
    });
  }
  return state;
}

describe('tips', () => {
  test('every tip has a Vermont Fish & Wildlife source URL', () => {
    expect(BEAR_TIPS.length).toBeGreaterThanOrEqual(6);
    for (const tip of BEAR_TIPS) {
      expect(tip.sourceUrl).toMatch(/^https:\/\/vtfishandwildlife\.com\//);
      expect(tip.title.length).toBeGreaterThan(0);
      expect(tip.body.length).toBeGreaterThan(0);
    }
  });

  test('selectTip rotates by tipIndex', () => {
    const a = createInitialState({ tipIndex: 0 });
    const b = createInitialState({ tipIndex: 1 });
    expect(selectTip(a).id).toBe(BEAR_TIPS[0]!.id);
    expect(selectTip(b).id).toBe(BEAR_TIPS[1]!.id);
    expect(selectTipByRound(BEAR_TIPS.length).id).toBe(BEAR_TIPS[0]!.id);
  });
});

describe('createInitialState', () => {
  test('starts with five unsecured attractants and playing phase', () => {
    const state = createInitialState({ rng: createSeededRng(1), tipIndex: 0 });
    expect(state.phase).toBe('playing');
    expect(state.score).toBe(0);
    expect(state.attractants).toHaveLength(5);
    expect(unsecuredAttractants(state)).toHaveLength(5);
    expect(state.bears).toHaveLength(0);
    expect(state.roundDurationMs).toBe(DEFAULT_ROUND_DURATION_MS);
  });

  test('uses injectable tip index', () => {
    const state = createInitialState({ tipIndex: 3 });
    expect(state.tipIndex).toBe(3);
  });
});

describe('secureAttractant', () => {
  test('marks attractant secured and increments score', () => {
    const start = createInitialState({ tipIndex: 0 });
    const id = start.attractants[0]!.id;
    const next = secureAttractant(start, id);
    expect(next.score).toBe(1);
    expect(next.attractants.find((a) => a.id === id)?.status).toBe('secured');
    expect(unsecuredAttractants(next)).toHaveLength(4);
  });

  test('is idempotent for already-secured attractants', () => {
    const start = createInitialState({ tipIndex: 0 });
    const id = start.attractants[0]!.id;
    const once = secureAttractant(start, id);
    const twice = secureAttractant(once, id);
    expect(twice.score).toBe(1);
  });

  test('securing all attractants ends the round in success', () => {
    let state = createInitialState({ tipIndex: 0 });
    for (const a of state.attractants) {
      state = secureAttractant(state, a.id);
    }
    expect(allAttractantsSecured(state)).toBe(true);
    expect(state.phase).toBe('success');
    expect(state.score).toBe(5);
  });

  test('does nothing after the round has ended', () => {
    let state = createInitialState({ tipIndex: 0 });
    for (const a of state.attractants) {
      state = secureAttractant(state, a.id);
    }
    const after = secureAttractant(state, state.attractants[0]!.id);
    expect(after).toEqual(state);
  });
});

describe('tick', () => {
  test('spawns bears that target unsecured attractants', () => {
    const rng = createSeededRng(42);
    let state = createInitialState({ rng, tipIndex: 0 });
    state = tick(state, 3_000, { rng });
    expect(state.bears.length).toBeGreaterThan(0);
    for (const bear of state.bears) {
      const target = state.attractants.find(
        (a) => a.id === bear.targetAttractantId,
      );
      expect(target?.status).toBe('unsecured');
    }
  });

  test('bear reaching food habituates and ends the round', () => {
    const rng = createSeededRng(7);
    const start = createInitialState({
      rng,
      tipIndex: 0,
      roundDurationMs: 120_000,
    });
    const end = playUntil(start, (s) => s.phase !== 'playing', {
      rng,
      speedScale: 4,
      deltaMs: 50,
    });
    expect(end.phase).toBe('habituated');
    expect(end.habituatedAttractantId).not.toBeNull();
  });

  test('timer expiry without habituation is success', () => {
    const rng = createSeededRng(99);
    let state = createInitialState({
      rng,
      tipIndex: 0,
      roundDurationMs: 500,
    });
    for (const a of state.attractants) {
      state = secureAttractant(state, a.id);
    }
    expect(state.phase).toBe('success');
  });

  test('elapsed timer alone can succeed when attractants stay unsecured but no bear arrives', () => {
    const short = createInitialState({
      rng: () => 0,
      tipIndex: 0,
      roundDurationMs: 200,
    });
    // Bears spawn but never reach food at speed 0.
    const end = playUntil(short, (s) => s.phase !== 'playing', {
      rng: () => 0,
      speedScale: 0,
      deltaMs: 50,
      maxTicks: 20,
    });
    expect(end.phase).toBe('success');
    expect(end.elapsedMs).toBeGreaterThanOrEqual(200);
  });

  test('does not advance when deltaMs is zero or phase is over', () => {
    const start = createInitialState({ tipIndex: 0 });
    expect(tick(start, 0)).toBe(start);
    const done = { ...start, phase: 'success' as const };
    expect(tick(done, 100)).toBe(done);
  });

  test('spawn interval shortens as the round progresses', () => {
    expect(spawnIntervalForProgress(0)).toBeGreaterThan(
      spawnIntervalForProgress(1),
    );
  });

  test('securing a bear target removes that bear', () => {
    const rng = createSeededRng(3);
    let state = createInitialState({ rng, tipIndex: 0 });
    state = tick(state, 3_000, { rng });
    expect(state.bears.length).toBeGreaterThan(0);
    const targetId = state.bears[0]!.targetAttractantId;
    state = secureAttractant(state, targetId);
    expect(state.bears.every((b) => b.targetAttractantId !== targetId)).toBe(
      true,
    );
  });
});
