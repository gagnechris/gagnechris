import { BEAR_TIPS, tipAtIndex, type BearTip } from './tips';

export type AttractantKind =
  'trash' | 'birdFeeder' | 'cooler' | 'grill' | 'petFood';

export type AttractantStatus = 'unsecured' | 'secured';

export type RoundOutcome = 'playing' | 'success' | 'habituated';

export type Attractant = {
  id: string;
  kind: AttractantKind;
  status: AttractantStatus;
  /** Position on the playfield, 0–100. */
  x: number;
  y: number;
  label: string;
};

export type Bear = {
  id: string;
  x: number;
  y: number;
  targetAttractantId: string;
  /** Units per second on the 0–100 playfield. */
  speed: number;
};

export type GameState = {
  phase: RoundOutcome;
  attractants: Attractant[];
  bears: Bear[];
  score: number;
  /** Milliseconds since the round started. */
  elapsedMs: number;
  /** Target round length before auto-success (~45s). */
  roundDurationMs: number;
  tipIndex: number;
  nextBearSeq: number;
  /** When the next bear should spawn (elapsedMs). */
  nextSpawnAtMs: number;
  /** Bears that reached food (for UI flair). */
  habituatedAttractantId: string | null;
};

/** Injectable RNG returning a float in [0, 1). */
export type Rng = () => number;

export const DEFAULT_ROUND_DURATION_MS = 45_000;
export const REACH_DISTANCE = 4;
export const BASE_BEAR_SPEED = 8;
export const MAX_BEAR_SPEED = 22;
export const INITIAL_SPAWN_MS = 2_200;
export const MIN_SPAWN_MS = 900;

const ATTRACTANT_LAYOUT: ReadonlyArray<{
  kind: AttractantKind;
  id: string;
  label: string;
  x: number;
  y: number;
}> = [
  { kind: 'trash', id: 'attract-trash', label: 'Trash', x: 18, y: 72 },
  {
    kind: 'birdFeeder',
    id: 'attract-bird',
    label: 'Bird feeder',
    x: 42,
    y: 28,
  },
  { kind: 'cooler', id: 'attract-cooler', label: 'Cooler', x: 68, y: 70 },
  { kind: 'grill', id: 'attract-grill', label: 'Grill', x: 82, y: 40 },
  { kind: 'petFood', id: 'attract-pet', label: 'Pet food', x: 28, y: 48 },
];

export function defaultRng(): Rng {
  return Math.random;
}

export function createSeededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    // Mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type CreateInitialStateOptions = {
  rng?: Rng;
  roundDurationMs?: number;
  /** Multiplier applied to bear speed (e.g. reduced-motion / easy). */
  speedScale?: number;
  tipIndex?: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function progress(elapsedMs: number, roundDurationMs: number): number {
  if (roundDurationMs <= 0) return 1;
  return clamp(elapsedMs / roundDurationMs, 0, 1);
}

export function bearSpeedForProgress(p: number, speedScale = 1): number {
  const eased = p * p;
  return (
    (BASE_BEAR_SPEED + (MAX_BEAR_SPEED - BASE_BEAR_SPEED) * eased) * speedScale
  );
}

export function spawnIntervalForProgress(p: number): number {
  return INITIAL_SPAWN_MS - (INITIAL_SPAWN_MS - MIN_SPAWN_MS) * p;
}

export function unsecuredAttractants(state: GameState): Attractant[] {
  return state.attractants.filter((a) => a.status === 'unsecured');
}

export function allAttractantsSecured(state: GameState): boolean {
  return state.attractants.every((a) => a.status === 'secured');
}

export function distance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

export function createInitialState(
  options: CreateInitialStateOptions = {},
): GameState {
  const rng = options.rng ?? defaultRng();
  const roundDurationMs = options.roundDurationMs ?? DEFAULT_ROUND_DURATION_MS;
  const tipIndex = options.tipIndex ?? Math.floor(rng() * BEAR_TIPS.length);

  const attractants: Attractant[] = ATTRACTANT_LAYOUT.map((item) => ({
    id: item.id,
    kind: item.kind,
    status: 'unsecured',
    x: item.x,
    y: item.y,
    label: item.label,
  }));

  return {
    phase: 'playing',
    attractants,
    bears: [],
    score: 0,
    elapsedMs: 0,
    roundDurationMs,
    tipIndex,
    nextBearSeq: 1,
    nextSpawnAtMs: INITIAL_SPAWN_MS * 0.6,
    habituatedAttractantId: null,
  };
}

function pickTarget(candidates: Attractant[], rng: Rng): Attractant | null {
  if (candidates.length === 0) return null;
  const index = Math.floor(rng() * candidates.length);
  return candidates[index] ?? null;
}

function spawnEdge(rng: Rng): { x: number; y: number } {
  const edge = Math.floor(rng() * 4);
  switch (edge) {
    case 0:
      return { x: rng() * 100, y: -4 };
    case 1:
      return { x: 104, y: rng() * 100 };
    case 2:
      return { x: rng() * 100, y: 104 };
    default:
      return { x: -4, y: rng() * 100 };
  }
}

export type TickOptions = {
  rng?: Rng;
  speedScale?: number;
};

/** Pure: returns a new state object. */
export function tick(
  state: GameState,
  deltaMs: number,
  options: TickOptions = {},
): GameState {
  if (state.phase !== 'playing' || deltaMs <= 0) {
    return state;
  }

  const rng = options.rng ?? defaultRng();
  const speedScale = options.speedScale ?? 1;
  const elapsedMs = state.elapsedMs + deltaMs;
  const p = progress(elapsedMs, state.roundDurationMs);
  const speed = bearSpeedForProgress(p, speedScale);

  const attractants = state.attractants;
  let bears = state.bears;
  let phase: RoundOutcome = 'playing';
  let habituatedAttractantId = state.habituatedAttractantId;
  let nextBearSeq = state.nextBearSeq;
  let nextSpawnAtMs = state.nextSpawnAtMs;
  const score = state.score;

  const moved: Bear[] = [];
  for (const bear of bears) {
    const target = attractants.find((a) => a.id === bear.targetAttractantId);
    if (!target || target.status === 'secured') {
      const open = attractants.filter((a) => a.status === 'unsecured');
      const next = pickTarget(open, rng);
      if (!next) continue;
      const step = (speed * deltaMs) / 1000;
      const dist = distance(bear.x, bear.y, next.x, next.y);
      if (dist <= REACH_DISTANCE) {
        phase = 'habituated';
        habituatedAttractantId = next.id;
        moved.push({
          ...bear,
          targetAttractantId: next.id,
          speed,
          x: next.x,
          y: next.y,
        });
        break;
      }
      const t = dist === 0 ? 0 : Math.min(1, step / dist);
      moved.push({
        ...bear,
        targetAttractantId: next.id,
        speed,
        x: bear.x + (next.x - bear.x) * t,
        y: bear.y + (next.y - bear.y) * t,
      });
      continue;
    }

    const step = (speed * deltaMs) / 1000;
    const dist = distance(bear.x, bear.y, target.x, target.y);
    if (dist <= REACH_DISTANCE) {
      phase = 'habituated';
      habituatedAttractantId = target.id;
      moved.push({ ...bear, speed, x: target.x, y: target.y });
      break;
    }
    const t = dist === 0 ? 0 : Math.min(1, step / dist);
    moved.push({
      ...bear,
      speed,
      x: bear.x + (target.x - bear.x) * t,
      y: bear.y + (target.y - bear.y) * t,
    });
  }
  bears = moved;

  if (phase === 'habituated') {
    return {
      ...state,
      phase,
      attractants,
      bears,
      score,
      elapsedMs,
      nextBearSeq,
      nextSpawnAtMs,
      habituatedAttractantId,
    };
  }

  while (
    elapsedMs >= nextSpawnAtMs &&
    attractants.some((a) => a.status === 'unsecured')
  ) {
    const open = attractants.filter((a) => a.status === 'unsecured');
    const target = pickTarget(open, rng);
    if (!target) break;
    const edge = spawnEdge(rng);
    bears = [
      ...bears,
      {
        id: `bear-${nextBearSeq}`,
        x: edge.x,
        y: edge.y,
        targetAttractantId: target.id,
        speed,
      },
    ];
    nextBearSeq += 1;
    nextSpawnAtMs += spawnIntervalForProgress(p);
  }

  if (elapsedMs >= state.roundDurationMs) {
    phase = 'success';
  }

  // All secured is also success (secureAttractant usually catches this first).
  if (attractants.every((a) => a.status === 'secured')) {
    phase = 'success';
  }

  return {
    ...state,
    phase,
    attractants,
    bears,
    score,
    elapsedMs,
    nextBearSeq,
    nextSpawnAtMs,
    habituatedAttractantId,
  };
}

export function secureAttractant(
  state: GameState,
  attractantId: string,
): GameState {
  if (state.phase !== 'playing') return state;

  const target = state.attractants.find((a) => a.id === attractantId);
  if (!target || target.status === 'secured') return state;

  const attractants = state.attractants.map((a) =>
    a.id === attractantId ? { ...a, status: 'secured' as const } : a,
  );
  const score = state.score + 1;
  const bears = state.bears.filter(
    (b) => b.targetAttractantId !== attractantId,
  );
  const phase: RoundOutcome = attractants.every((a) => a.status === 'secured')
    ? 'success'
    : 'playing';

  return {
    ...state,
    attractants,
    bears,
    score,
    phase,
  };
}

export function selectTip(state: GameState): BearTip {
  return tipAtIndex(state.tipIndex);
}

export function selectTipByRound(roundNumber: number): BearTip {
  return tipAtIndex(roundNumber);
}

export function securedCount(state: GameState): number {
  return state.attractants.filter((a) => a.status === 'secured').length;
}

export function totalAttractants(state: GameState): number {
  return state.attractants.length;
}

export { BEAR_TIPS, tipAtIndex };
