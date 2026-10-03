import type { Season } from '../facts';

/** Logical world units: the view is always 720 tall; ground top is at GROUND_Y. */
export const WORLD_HEIGHT = 720;
export const GROUND_Y = 600;

/** Only foods VT Fish & Wildlife names for each season (see facts.ts). */
export type NaturalFoodKind =
  | 'greens'
  | 'insects'
  | 'roots'
  | 'berries'
  | 'beechnuts'
  | 'acorns'
  | 'apples';

export type CampFoodKind = 'trash' | 'feeder' | 'cooler';

export type Solid = { x: number; w: number; h: number; kind: 'log' | 'rock' };

export type FoodSpot = {
  id: string;
  kind: NaturalFoodKind;
  x: number;
  /** Bottom of the food's box; GROUND_Y for food on the ground. */
  bottom: number;
  /** Only edible while Sniff is revealing it. */
  hidden?: boolean;
};

export type CampFood = { id: string; kind: CampFoodKind; x: number };
/** Offsets stagger when each camper looks up and each dog wakes. */
export type Person = { id: string; x: number; offsetMs?: number };
export type Dog = { id: string; x: number; offsetMs?: number };

/**
 * A high fallen log Maple can walk along to skip a campsite. One-way: she can
 * walk underneath and jump up through it, and only lands on it from above.
 * `top` is its height above the ground.
 */
export type Platform = { x: number; w: number; top: number };
export type Road = {
  id: string;
  x: number;
  w: number;
  periodMs: number;
  carMs: number;
};

export type Decor = {
  x: number;
  kind:
    'beech' | 'oak' | 'pine' | 'apple' | 'tent' | 'table' | 'den' | 'cattails';
};

export type WildLevel = {
  season: Season;
  title: string;
  goal: string;
  length: number;
  timeMs: number;
  solids: Solid[];
  platforms: Platform[];
  foods: FoodSpot[];
  camp: CampFood[];
  people: Person[];
  dogs: Dog[];
  roads: Road[];
  decor: Decor[];
};

export const FOOD_SIZE: Readonly<
  Record<NaturalFoodKind, { w: number; h: number }>
> = {
  greens: { w: 46, h: 30 },
  insects: { w: 40, h: 18 },
  roots: { w: 36, h: 30 },
  berries: { w: 56, h: 40 },
  beechnuts: { w: 26, h: 26 },
  acorns: { w: 26, h: 26 },
  apples: { w: 30, h: 30 },
};

/** Tuned so all natural food across the three seasons is about 100% winter fat. */
export const FOOD_GAIN: Readonly<Record<NaturalFoodKind, number>> = {
  greens: 1.5,
  insects: 4,
  roots: 2,
  berries: 3,
  beechnuts: 2,
  acorns: 2,
  apples: 2.5,
};

export const FOOD_LABEL: Readonly<Record<NaturalFoodKind, string>> = {
  greens: 'wetland greens',
  insects: 'insects',
  roots: 'jack-in-the-pulpit roots',
  berries: 'berries',
  beechnuts: 'beechnuts',
  acorns: 'acorns',
  apples: 'apples',
};

export const CAMP_FOOD_LABEL: Readonly<Record<CampFoodKind, string>> = {
  trash: 'trash',
  feeder: 'bird seed',
  cooler: 'cooler food',
};

export const CAMP_FOOD_SIZE = { w: 52, h: 62 };

const ground = (
  id: string,
  kind: NaturalFoodKind,
  x: number,
  hidden?: boolean,
): FoodSpot => ({ id, kind, x, bottom: GROUND_Y, hidden });

const onRock = (id: string, kind: NaturalFoodKind, rock: Solid): FoodSpot => ({
  id,
  kind,
  x: rock.x + rock.w / 2 - FOOD_SIZE[kind].w / 2,
  bottom: GROUND_Y - rock.h,
});

const springRocks: Solid[] = [
  { x: 1750, w: 170, h: 90, kind: 'rock' },
  { x: 3350, w: 170, h: 90, kind: 'rock' },
];
const summerRocks: Solid[] = [
  { x: 1500, w: 170, h: 90, kind: 'rock' },
  { x: 4150, w: 170, h: 90, kind: 'rock' },
];
const fallRocks: Solid[] = [{ x: 2900, w: 170, h: 90, kind: 'rock' }];

export const WILD_LEVELS: readonly WildLevel[] = [
  {
    season: 'spring',
    title: 'Spring',
    goal: 'Head down to the wetland',
    length: 5200,
    timeMs: 45_000,
    solids: [
      { x: 1100, w: 150, h: 40, kind: 'log' },
      ...springRocks,
      { x: 2500, w: 150, h: 40, kind: 'log' },
      { x: 3900, w: 150, h: 40, kind: 'log' },
    ],
    platforms: [{ x: 2620, w: 710, top: 150 }],
    foods: [
      ground('sp-g1', 'greens', 420),
      ground('sp-g2', 'greens', 760),
      ground('sp-i1', 'insects', 1040, true),
      ground('sp-g3', 'greens', 1450),
      onRock('sp-g4', 'greens', springRocks[0]!),
      ground('sp-g5', 'greens', 2150),
      ground('sp-i2', 'insects', 2440, true),
      onRock('sp-g6', 'greens', springRocks[1]!),
      ground('sp-i3', 'insects', 3840, true),
      ground('sp-g7', 'greens', 4500),
      ground('sp-g8', 'greens', 4780),
    ],
    camp: [{ id: 'sp-c1', kind: 'feeder', x: 2900 }],
    people: [{ id: 'sp-p1', x: 3080 }],
    dogs: [],
    roads: [{ id: 'sp-r1', x: 4150, w: 220, periodMs: 4_200, carMs: 1_400 }],
    decor: [
      { x: 300, kind: 'den' },
      { x: 900, kind: 'pine' },
      { x: 2000, kind: 'pine' },
      { x: 2780, kind: 'tent' },
      { x: 3600, kind: 'pine' },
      { x: 4950, kind: 'cattails' },
    ],
  },
  {
    season: 'summer',
    title: 'Summer',
    goal: 'Find the berry patches, skip the campsite',
    length: 5400,
    timeMs: 45_000,
    solids: [
      { x: 900, w: 150, h: 40, kind: 'log' },
      ...summerRocks,
      { x: 2350, w: 150, h: 40, kind: 'log' },
      { x: 3500, w: 150, h: 40, kind: 'log' },
    ],
    platforms: [{ x: 2470, w: 910, top: 150 }],
    foods: [
      ground('su-r1', 'roots', 520),
      ground('su-b1', 'berries', 700),
      ground('su-i1', 'insects', 840, true),
      ground('su-b2', 'berries', 1250),
      onRock('su-b3', 'berries', summerRocks[0]!),
      ground('su-r2', 'roots', 1950),
      ground('su-b4', 'berries', 2250),
      ground('su-i2', 'insects', 3440, true),
      ground('su-b5', 'berries', 3800),
      onRock('su-b6', 'berries', summerRocks[1]!),
      ground('su-b7', 'berries', 4700),
      ground('su-b8', 'berries', 5000),
    ],
    camp: [{ id: 'su-c1', kind: 'trash', x: 2750 }],
    people: [{ id: 'su-p1', x: 2950 }],
    dogs: [{ id: 'su-d1', x: 3150, offsetMs: 1_500 }],
    roads: [{ id: 'su-r1', x: 4400, w: 220, periodMs: 3_800, carMs: 1_400 }],
    decor: [
      { x: 600, kind: 'pine' },
      { x: 1800, kind: 'pine' },
      { x: 2650, kind: 'tent' },
      { x: 2880, kind: 'table' },
      { x: 4000, kind: 'pine' },
    ],
  },
  {
    season: 'fall',
    title: 'Fall',
    goal: 'Fill up on beechnuts, then reach the den',
    length: 5600,
    timeMs: 45_000,
    solids: [
      { x: 1500, w: 150, h: 40, kind: 'log' },
      { x: 2010, w: 140, h: 40, kind: 'log' },
      ...fallRocks,
      { x: 3240, w: 140, h: 40, kind: 'log' },
      { x: 4000, w: 150, h: 40, kind: 'log' },
    ],
    platforms: [
      { x: 2130, w: 660, top: 150 },
      { x: 3360, w: 460, top: 150 },
    ],
    foods: [
      ground('fa-n1', 'beechnuts', 560),
      ground('fa-n2', 'beechnuts', 640),
      ground('fa-n3', 'beechnuts', 720),
      ground('fa-a1', 'apples', 1150),
      ground('fa-i1', 'insects', 1440, true),
      ground('fa-o1', 'acorns', 1900),
      ground('fa-o2', 'acorns', 1980),
      onRock('fa-n4', 'beechnuts', fallRocks[0]!),
      ground('fa-n5', 'beechnuts', 3110),
      ground('fa-n6', 'beechnuts', 3170),
      ground('fa-i2', 'insects', 3940, true),
      ground('fa-a2', 'apples', 4500),
      ground('fa-o3', 'acorns', 4900),
    ],
    camp: [
      { id: 'fa-c1', kind: 'cooler', x: 2350 },
      { id: 'fa-c2', kind: 'trash', x: 3700 },
    ],
    people: [{ id: 'fa-p1', x: 2530, offsetMs: 800 }],
    dogs: [{ id: 'fa-d1', x: 3560, offsetMs: 2_200 }],
    roads: [{ id: 'fa-r1', x: 4650, w: 220, periodMs: 3_400, carMs: 1_400 }],
    decor: [
      { x: 640, kind: 'beech' },
      { x: 1150, kind: 'apple' },
      { x: 1950, kind: 'oak' },
      { x: 2250, kind: 'tent' },
      { x: 3340, kind: 'beech' },
      { x: 4500, kind: 'apple' },
      { x: 4900, kind: 'oak' },
      { x: 5380, kind: 'den' },
    ],
  },
];
