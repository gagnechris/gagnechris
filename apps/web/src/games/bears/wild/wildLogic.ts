import { tipById, type BearTip } from '../tips';
import {
  CAMP_FOOD_SIZE,
  FOOD_GAIN,
  FOOD_SIZE,
  GROUND_Y,
  WILD_LEVELS,
  type CampFoodKind,
  type NaturalFoodKind,
  type WildLevel,
} from './wildLevels';

export const STEP_MS = 1000 / 60;
const DT = STEP_MS / 1000;

export const MAPLE_W = 110;
export const MAPLE_H = 64;
export const RUN_SPEED = 300;
export const JUMP_SPEED = 760;
export const GRAVITY = 2000;

export const START_FAT = 15;
export const CAMP_FOOD_GAIN = 15;
export const COMFY_LIMIT = 3;
export const WELL_FED_FAT = 70;

export const SNIFF_MS = 3_000;
export const SNIFF_COOLDOWN_MS = 5_000;
export const SNIFF_RANGE = 450;

export const PERSON_RANGE = 170;
export const DOG_RANGE = 120;
/** Short, just so one shove doesn't immediately repeat. */
const REACT_COOLDOWN_MS = 1_200;
const WARN_RANGE = 520;
/** Campers are busy, then look up and watch for a while. */
export const PERSON_CYCLE = { periodMs: 5_000, activeMs: 2_000 };
/** Dogs nap, then wake up for a while. */
export const DOG_CYCLE = { periodMs: 4_400, activeMs: 1_700 };
/** Up on a high log, Maple is out of the way and nobody reacts. */
const HIGH_ROUTE_CLEARANCE = 100;
const PUSHBACK_MS = 500;
const PUSHBACK_SPEED = 450;
const BUBBLE_MS = 1_400;
const GOAL_MARGIN = 80;
const START_X = 80;
const POINTS_PER_FAT = 10;
const POINTS_PER_SECOND_LEFT = 5;

export type WildInput = {
  left: boolean;
  right: boolean;
  /** Pressed since the last step (edge, not held). */
  jump: boolean;
  sniff: boolean;
};

export const NO_INPUT: WildInput = {
  left: false,
  right: false,
  jump: false,
  sniff: false,
};

export type Maple = {
  x: number;
  /** Top of Maple's box. */
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: 1 | -1;
  pushedUntil: number;
};

export type WildPhase = 'playing' | 'den' | 'habituated';

export type Bubble = { text: string; x: number; until: number };

export type WildState = {
  levels: readonly WildLevel[];
  phase: WildPhase;
  level: number;
  /** ms since this level started. */
  levelT: number;
  maple: Maple;
  fat: number;
  comfy: number;
  naturalEaten: number;
  campSnacks: number;
  eaten: readonly string[];
  sniffUntil: number;
  sniffReadyAt: number;
  /** Per person/dog id: levelT when they can react again. */
  reactReadyAt: Readonly<Record<string, number>>;
  /** Person/dog ids whose "wait or go around" hint has been given this level. */
  warned: readonly string[];
  bubble: Bubble | null;
  timeBonus: number;
};

export type WildEvent =
  | { type: 'eat'; kind: NaturalFoodKind; gain: number; x: number; y: number }
  | {
      type: 'campSnack';
      kind: CampFoodKind;
      comfy: number;
      x: number;
      y: number;
    }
  | { type: 'sniff' }
  | { type: 'clap' }
  | { type: 'bark' }
  | { type: 'warn'; who: 'person' | 'dog' }
  | { type: 'car' }
  | { type: 'level'; level: number; reason: 'goal' | 'time' }
  | { type: 'end'; phase: Exclude<WildPhase, 'playing'> };

export type WildStepResult = { state: WildState; events: WildEvent[] };

function freshMaple(): Maple {
  return {
    x: START_X,
    y: GROUND_Y - MAPLE_H,
    vx: 0,
    vy: 0,
    onGround: true,
    facing: 1,
    pushedUntil: 0,
  };
}

export function createWildState(
  levels: readonly WildLevel[] = WILD_LEVELS,
): WildState {
  return {
    levels,
    phase: 'playing',
    level: 0,
    levelT: 0,
    maple: freshMaple(),
    fat: START_FAT,
    comfy: 0,
    naturalEaten: 0,
    campSnacks: 0,
    eaten: [],
    sniffUntil: 0,
    sniffReadyAt: 0,
    reactReadyAt: {},
    warned: [],
    bubble: null,
    timeBonus: 0,
  };
}

export function currentLevel(state: WildState): WildLevel {
  return state.levels[Math.min(state.level, state.levels.length - 1)]!;
}

export function levelSecondsLeft(state: WildState): number {
  return Math.max(
    0,
    Math.ceil((currentLevel(state).timeMs - state.levelT) / 1000),
  );
}

type Box = { x: number; y: number; w: number; h: number };

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function isSniffing(state: WildState): boolean {
  return state.levelT < state.sniffUntil;
}

export function sniffReady(state: WildState): boolean {
  return state.phase === 'playing' && state.levelT >= state.sniffReadyAt;
}

/** Hidden food shows (and can be eaten) while Sniff is active and it's in range. */
export function isRevealed(state: WildState, foodX: number): boolean {
  return (
    isSniffing(state) &&
    Math.abs(foodX - (state.maple.x + MAPLE_W / 2)) <= SNIFF_RANGE
  );
}

export function cycleActive(
  levelT: number,
  cycle: { periodMs: number; activeMs: number },
  offsetMs = 0,
): boolean {
  return (
    (levelT + offsetMs) % cycle.periodMs >= cycle.periodMs - cycle.activeMs
  );
}

export function personWatching(levelT: number, offsetMs = 0): boolean {
  return cycleActive(levelT, PERSON_CYCLE, offsetMs);
}

export function dogAwake(levelT: number, offsetMs = 0): boolean {
  return cycleActive(levelT, DOG_CYCLE, offsetMs);
}

export function onHighRoute(maple: Maple): boolean {
  return maple.y + MAPLE_H <= GROUND_Y - HIGH_ROUTE_CLEARANCE;
}

export function carOnRoad(
  levelT: number,
  road: { periodMs: number; carMs: number },
): boolean {
  return levelT % road.periodMs < road.carMs;
}

function moveMaple(
  maple: Maple,
  level: WildLevel,
  input: WildInput,
  t: number,
): Maple {
  const m = { ...maple };
  const pushed = t < m.pushedUntil;
  if (!pushed) {
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    m.vx = dir * RUN_SPEED;
    if (dir !== 0) m.facing = dir > 0 ? 1 : -1;
    if (input.jump && m.onGround) {
      m.vy = -JUMP_SPEED;
      m.onGround = false;
    }
  }

  m.vy += GRAVITY * DT;

  // Horizontal, then vertical, so a log blocks Maple from the side but she can land on it.
  const prevX = m.x;
  m.x = Math.max(0, Math.min(level.length - MAPLE_W, m.x + m.vx * DT));
  for (const s of level.solids) {
    const top = GROUND_Y - s.h;
    if (m.y + MAPLE_H <= top + 1) continue;
    if (
      !overlaps(
        { x: m.x, y: m.y, w: MAPLE_W, h: MAPLE_H },
        { x: s.x, y: top, w: s.w, h: s.h },
      )
    )
      continue;
    m.x = prevX + MAPLE_W <= s.x ? s.x - MAPLE_W : s.x + s.w;
  }

  const prevBottom = m.y + MAPLE_H;
  m.y += m.vy * DT;
  m.onGround = false;
  let floor = GROUND_Y;
  const surfaces = [
    ...level.solids.map((s) => ({ x: s.x, w: s.w, top: GROUND_Y - s.h })),
    ...level.platforms.map((p) => ({ x: p.x, w: p.w, top: GROUND_Y - p.top })),
  ];
  for (const s of surfaces) {
    if (m.x + MAPLE_W > s.x && m.x < s.x + s.w && prevBottom <= s.top + 0.5) {
      floor = Math.min(floor, s.top);
    }
  }
  if (m.y + MAPLE_H >= floor && m.vy >= 0) {
    m.y = floor - MAPLE_H;
    m.vy = 0;
    m.onGround = true;
  }
  return m;
}

function pushAwayFrom(maple: Maple, fromX: number, t: number): Maple {
  const dir = maple.x + MAPLE_W / 2 < fromX ? -1 : 1;
  return { ...maple, vx: dir * PUSHBACK_SPEED, pushedUntil: t + PUSHBACK_MS };
}

function startLevel(state: WildState, level: number): WildState {
  return {
    ...state,
    level,
    levelT: 0,
    maple: freshMaple(),
    eaten: [],
    sniffUntil: 0,
    sniffReadyAt: 0,
    reactReadyAt: {},
    warned: [],
    bubble: null,
  };
}

export function stepWild(state: WildState, input: WildInput): WildStepResult {
  if (state.phase !== 'playing') return { state, events: [] };

  const events: WildEvent[] = [];
  const level = currentLevel(state);
  const t = state.levelT + STEP_MS;
  let s: WildState = { ...state, levelT: t };

  if (input.sniff && t >= s.sniffReadyAt) {
    s = { ...s, sniffUntil: t + SNIFF_MS, sniffReadyAt: t + SNIFF_COOLDOWN_MS };
    events.push({ type: 'sniff' });
  }

  let maple = moveMaple(s.maple, level, input, t);
  const box = { x: maple.x, y: maple.y, w: MAPLE_W, h: MAPLE_H };
  const center = maple.x + MAPLE_W / 2;
  const eaten = [...s.eaten];
  let { fat, comfy, naturalEaten, campSnacks, bubble } = s;
  const reactReadyAt = { ...s.reactReadyAt };

  for (const food of level.foods) {
    if (eaten.includes(food.id)) continue;
    if (food.hidden && !isRevealed(s, food.x)) continue;
    const size = FOOD_SIZE[food.kind];
    if (
      overlaps(box, {
        x: food.x,
        y: food.bottom - size.h,
        w: size.w,
        h: size.h,
      })
    ) {
      eaten.push(food.id);
      const gain = FOOD_GAIN[food.kind];
      fat = Math.min(100, fat + gain);
      naturalEaten += 1;
      events.push({
        type: 'eat',
        kind: food.kind,
        gain,
        x: food.x + size.w / 2,
        y: food.bottom - size.h / 2,
      });
    }
  }

  for (const food of level.camp) {
    if (eaten.includes(food.id)) continue;
    const foodBox = {
      x: food.x,
      y: GROUND_Y - CAMP_FOOD_SIZE.h,
      w: CAMP_FOOD_SIZE.w,
      h: CAMP_FOOD_SIZE.h,
    };
    if (overlaps(box, foodBox)) {
      eaten.push(food.id);
      fat = Math.min(100, fat + CAMP_FOOD_GAIN);
      comfy += 1;
      campSnacks += 1;
      events.push({
        type: 'campSnack',
        kind: food.kind,
        comfy,
        x: food.x + CAMP_FOOD_SIZE.w / 2,
        y: GROUND_Y - CAMP_FOOD_SIZE.h / 2,
      });
    }
  }

  const warned = [...s.warned];
  const high = onHighRoute(maple);

  for (const person of level.people) {
    const dist = Math.abs(center - person.x);
    if (!warned.includes(person.id) && dist < WARN_RANGE && center < person.x) {
      warned.push(person.id);
      events.push({ type: 'warn', who: 'person' });
    }
    if (high || t < (reactReadyAt[person.id] ?? 0)) continue;
    if (dist < PERSON_RANGE && personWatching(t, person.offsetMs)) {
      maple = pushAwayFrom(maple, person.x, t);
      reactReadyAt[person.id] = t + REACT_COOLDOWN_MS;
      bubble = {
        text: 'CLAP CLAP! GO ON, BEAR!',
        x: person.x,
        until: t + BUBBLE_MS,
      };
      events.push({ type: 'clap' });
    }
  }

  for (const dog of level.dogs) {
    const dist = Math.abs(center - dog.x);
    if (!warned.includes(dog.id) && dist < WARN_RANGE && center < dog.x) {
      warned.push(dog.id);
      events.push({ type: 'warn', who: 'dog' });
    }
    if (high || t < (reactReadyAt[dog.id] ?? 0)) continue;
    if (dist < DOG_RANGE && dogAwake(t, dog.offsetMs)) {
      maple = pushAwayFrom(maple, dog.x, t);
      reactReadyAt[dog.id] = t + REACT_COOLDOWN_MS;
      bubble = { text: 'Woof!', x: dog.x, until: t + BUBBLE_MS };
      events.push({ type: 'bark' });
    }
  }

  for (const road of level.roads) {
    const onRoad = maple.x + MAPLE_W > road.x && maple.x < road.x + road.w;
    if (onRoad && carOnRoad(t, road)) {
      maple = {
        ...maple,
        x: road.x - MAPLE_W - 10,
        vx: 0,
        pushedUntil: t + PUSHBACK_MS,
      };
      bubble = {
        text: 'Car! Maple waits at the edge.',
        x: road.x,
        until: t + BUBBLE_MS,
      };
      events.push({ type: 'car' });
    }
  }

  if (bubble && t >= bubble.until) bubble = null;

  s = {
    ...s,
    maple,
    fat,
    comfy,
    naturalEaten,
    campSnacks,
    eaten,
    reactReadyAt,
    warned,
    bubble,
  };

  if (comfy >= COMFY_LIMIT) {
    events.push({ type: 'end', phase: 'habituated' });
    return { state: { ...s, phase: 'habituated' }, events };
  }

  const reachedGoal = maple.x + MAPLE_W >= level.length - GOAL_MARGIN;
  const outOfTime = t >= level.timeMs;
  if (reachedGoal || outOfTime) {
    const reason = reachedGoal ? 'goal' : 'time';
    const timeBonus =
      s.timeBonus +
      (reachedGoal ? levelSecondsLeft(s) * POINTS_PER_SECOND_LEFT : 0);
    events.push({ type: 'level', level: s.level, reason });
    if (s.level >= s.levels.length - 1) {
      events.push({ type: 'end', phase: 'den' });
      return { state: { ...s, timeBonus, phase: 'den' }, events };
    }
    return { state: startLevel({ ...s, timeBonus }, s.level + 1), events };
  }

  return { state: s, events };
}

export function wildScore(state: WildState): number {
  return Math.round(state.fat) * POINTS_PER_FAT + state.timeBonus;
}

export function wildPaws(state: WildState): number {
  return Math.max(0, COMFY_LIMIT - state.comfy);
}

export function wildTip(state: WildState): BearTip {
  if (state.phase === 'habituated' || state.campSnacks > 0) {
    return tipById('fed-bear')!;
  }
  return tipById('never-feed')!;
}
