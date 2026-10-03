import type { CampItemKind } from '../facts';
import type { Rng } from '../shared/rng';
import { tipById, type BearTip } from '../tips';

export type { CampItemKind };

export type CampItem = {
  kind: CampItemKind;
  label: string;
  /** Position on the 0–100 field. */
  x: number;
  y: number;
  guestToast: string;
};

export const CAMP_ITEMS: readonly CampItem[] = [
  {
    kind: 'trash',
    label: 'Trash',
    x: 18,
    y: 72,
    guestToast: 'Someone set a trash bag down.',
  },
  {
    kind: 'feeder',
    label: 'Bird feeder',
    x: 48,
    y: 44,
    guestToast: 'A guest refilled the bird feeder.',
  },
  {
    kind: 'cooler',
    label: 'Cooler',
    x: 68,
    y: 74,
    guestToast: 'The cooler got left open.',
  },
  {
    kind: 'grill',
    label: 'Grill',
    x: 84,
    y: 50,
    guestToast: 'Burgers are done. The grill is still greasy.',
  },
  {
    kind: 'pet',
    label: 'Pet food',
    x: 26,
    y: 52,
    guestToast: 'The dog’s bowl is out on the porch.',
  },
];

export const ROUND_MS = 60_000;
/** The simulation only advances in fixed steps so a seed replays identically. */
export const STEP_MS = 100;
export const SNACK_LIMIT = 3;
export const NOISE_COOLDOWN_MS = 6_000;
export const REACH_DISTANCE = 4;
export const POINTS_PER_SECOND = 10;
export const POINTS_PER_SAVE = 25;

const FIRST_BEAR_AT_MS = 1_500;
const FIRST_GUEST_AT_MS = 2_500;
const LEAVING_SPEED_FACTOR = 2.4;
const STARTS_OUT: readonly CampItemKind[] = ['trash', 'cooler', 'pet'];

export type CampBear = {
  id: string;
  x: number;
  y: number;
  target: CampItemKind;
  leaving: boolean;
};

export type CampPhase = 'playing' | 'dark' | 'habituated';

export type CampState = {
  phase: CampPhase;
  /** Elapsed ms, always a multiple of STEP_MS. */
  t: number;
  out: Record<CampItemKind, boolean>;
  bears: CampBear[];
  snacks: number;
  lost: Record<CampItemKind, number>;
  saves: number;
  nextGuestAt: number;
  nextBearAt: number;
  noiseReadyAt: number;
  nextBearSeq: number;
};

/**
 * Two streams so the event schedule (when guests and bears arrive, and from
 * where) never depends on what the player did; only the choice of item does.
 */
export type CampRngs = {
  schedule: Rng;
  choice: Rng;
};

export type CampEvent =
  | { type: 'guest'; kind: CampItemKind }
  | { type: 'snack'; kind: CampItemKind }
  | { type: 'putAway'; kind: CampItemKind; save: boolean }
  | { type: 'noise' }
  | { type: 'end'; phase: Exclude<CampPhase, 'playing'> };

export type CampStepResult = {
  state: CampState;
  events: CampEvent[];
};

const ITEM_BY_KIND = Object.fromEntries(
  CAMP_ITEMS.map((item) => [item.kind, item]),
) as Record<CampItemKind, CampItem>;

export function campItem(kind: CampItemKind): CampItem {
  return ITEM_BY_KIND[kind];
}

function perKind<T>(value: (kind: CampItemKind) => T): Record<CampItemKind, T> {
  return Object.fromEntries(
    CAMP_ITEMS.map((item) => [item.kind, value(item.kind)]),
  ) as Record<CampItemKind, T>;
}

export function createCampState(): CampState {
  return {
    phase: 'playing',
    t: 0,
    out: perKind((kind) => STARTS_OUT.includes(kind)),
    bears: [],
    snacks: 0,
    lost: perKind(() => 0),
    saves: 0,
    nextGuestAt: FIRST_GUEST_AT_MS,
    nextBearAt: FIRST_BEAR_AT_MS,
    noiseReadyAt: 0,
    nextBearSeq: 1,
  };
}

export function roundProgress(t: number): number {
  return Math.min(1, Math.max(0, t / ROUND_MS));
}

export function guestIntervalMs(atMs: number, jitter: number): number {
  return 4_200 - 2_000 * roundProgress(atMs) + jitter * 1_200;
}

export function bearIntervalMs(atMs: number, jitter: number): number {
  return 3_600 - 1_800 * roundProgress(atMs) + jitter * 800;
}

/** Field units per second. */
export function bearSpeed(t: number): number {
  return 7 + 7 * roundProgress(t);
}

function pick<T>(list: readonly T[], rng: Rng): T | undefined {
  if (list.length === 0) return undefined;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

function kindsWhere(
  out: Record<CampItemKind, boolean>,
  isOut: boolean,
): CampItemKind[] {
  return CAMP_ITEMS.map((i) => i.kind).filter((k) => out[k] === isOut);
}

/** Advance one fixed step. Returns the same state object when not playing. */
export function stepCamp(state: CampState, rngs: CampRngs): CampStepResult {
  if (state.phase !== 'playing') return { state, events: [] };

  const events: CampEvent[] = [];
  const t = state.t + STEP_MS;
  const out = { ...state.out };
  const lost = { ...state.lost };
  let { snacks, nextGuestAt, nextBearAt, nextBearSeq } = state;
  let bears = state.bears.map((b) => ({ ...b }));

  while (t >= nextGuestAt) {
    const jitter = rngs.schedule();
    const kind = pick(kindsWhere(out, false), rngs.choice);
    if (kind) {
      out[kind] = true;
      events.push({ type: 'guest', kind });
    }
    nextGuestAt += guestIntervalMs(nextGuestAt, jitter);
  }

  while (t >= nextBearAt) {
    const fromLeft = rngs.schedule() < 0.5;
    const y = 40 + rngs.schedule() * 45;
    const jitter = rngs.schedule();
    const target = pick(kindsWhere(out, true), rngs.choice);
    if (target) {
      bears.push({
        id: `bear-${nextBearSeq}`,
        x: fromLeft ? -6 : 106,
        y,
        target,
        leaving: false,
      });
      nextBearSeq += 1;
    }
    nextBearAt += bearIntervalMs(nextBearAt, jitter);
  }

  const step = (bearSpeed(t) * STEP_MS) / 1000;
  bears = bears.filter((bear) => {
    if (bear.leaving) {
      bear.x += (bear.x < 50 ? -1 : 1) * step * LEAVING_SPEED_FACTOR;
      return bear.x > -10 && bear.x < 110;
    }
    if (!out[bear.target]) {
      bear.leaving = true;
      return true;
    }
    const item = ITEM_BY_KIND[bear.target];
    const dx = item.x - bear.x;
    const dy = item.y - bear.y;
    const dist = Math.hypot(dx, dy);
    if (dist < REACH_DISTANCE) {
      snacks += 1;
      lost[bear.target] += 1;
      out[bear.target] = false;
      bear.leaving = true;
      events.push({ type: 'snack', kind: bear.target });
      return true;
    }
    const k = Math.min(1, step / dist);
    bear.x += dx * k;
    bear.y += dy * k;
    return true;
  });

  let phase: CampPhase = 'playing';
  if (snacks >= SNACK_LIMIT) phase = 'habituated';
  else if (t >= ROUND_MS) phase = 'dark';
  if (phase !== 'playing') events.push({ type: 'end', phase });

  return {
    state: {
      ...state,
      phase,
      t,
      out,
      bears,
      snacks,
      lost,
      nextGuestAt,
      nextBearAt,
      nextBearSeq,
    },
    events,
  };
}

/** A save is putting away an item a bear is already heading for. */
export function putAway(state: CampState, kind: CampItemKind): CampStepResult {
  if (state.phase !== 'playing' || !state.out[kind]) {
    return { state, events: [] };
  }
  const save = state.bears.some((b) => !b.leaving && b.target === kind);
  return {
    state: {
      ...state,
      out: { ...state.out, [kind]: false },
      bears: state.bears.map((b) =>
        b.target === kind ? { ...b, leaving: true } : b,
      ),
      saves: state.saves + (save ? 1 : 0),
    },
    events: [{ type: 'putAway', kind, save }],
  };
}

export function noiseReady(state: CampState): boolean {
  return state.phase === 'playing' && state.t >= state.noiseReadyAt;
}

export function makeNoise(state: CampState, bearId: string): CampStepResult {
  const bear = state.bears.find((b) => b.id === bearId);
  if (!noiseReady(state) || !bear || bear.leaving) {
    return { state, events: [] };
  }
  return {
    state: {
      ...state,
      bears: state.bears.map((b) =>
        b.id === bearId ? { ...b, leaving: true } : b,
      ),
      noiseReadyAt: state.t + NOISE_COOLDOWN_MS,
    },
    events: [{ type: 'noise' }],
  };
}

export function isTargeted(state: CampState, kind: CampItemKind): boolean {
  return state.bears.some((b) => !b.leaving && b.target === kind);
}

export function campScore(state: CampState): number {
  return (
    Math.floor(state.t / 1000) * POINTS_PER_SECOND +
    state.saves * POINTS_PER_SAVE
  );
}

export function campPaws(state: CampState): number {
  return state.phase === 'habituated'
    ? 0
    : Math.max(0, SNACK_LIMIT - state.snacks);
}

export function secondsLeft(state: CampState): number {
  return Math.max(0, Math.ceil((ROUND_MS - state.t) / 1000));
}

/** The item bears got into most; ties go to the earlier item in CAMP_ITEMS. */
export function mostLostItem(state: CampState): CampItemKind | null {
  let worst: CampItemKind | null = null;
  for (const { kind } of CAMP_ITEMS) {
    if (state.lost[kind] > (worst ? state.lost[worst] : 0)) worst = kind;
  }
  return worst;
}

const TIP_FOR_ITEM: Readonly<Record<CampItemKind, string>> = {
  trash: 'secure-trash',
  feeder: 'bird-feeders',
  cooler: 'campsite',
  grill: 'campsite',
  pet: 'pet-food',
};

export function campTip(state: CampState): BearTip {
  const worst = mostLostItem(state);
  return tipById(worst ? TIP_FOR_ITEM[worst] : 'never-feed')!;
}
