import {
  BEAR_ENCOUNTER_URL,
  BEAR_FAQ_URL,
  BEAR_GUIDANCE_URL,
  BLACK_BEAR_NATURAL_HISTORY_URL,
} from './tips';

/** A claim either game makes on screen, with the page that supports it. */
export type BearFact = {
  id: string;
  text: string;
  sourceUrl: string;
};

export type Season = 'spring' | 'summer' | 'fall';

export type SeasonFoods = {
  season: Season;
  /** Only foods the source names for this season. */
  foods: readonly string[];
  fact: BearFact;
};

export const SEASON_FOODS: readonly SeasonFoods[] = [
  {
    season: 'spring',
    foods: ['wetland grasses', 'green leafy plants'],
    fact: {
      id: 'spring-foods',
      text: 'Spring is the hardest time of year for bears. Food is scarce, and wetland grasses and green leafy plants are their main food.',
      sourceUrl: BLACK_BEAR_NATURAL_HISTORY_URL,
    },
  },
  {
    season: 'summer',
    foods: [
      'jack-in-the-pulpit roots',
      'raspberries',
      'blueberries',
      'blackberries',
    ],
    fact: {
      id: 'summer-foods',
      text: 'In summer, bears eat succulent plants like jack-in-the-pulpit roots, then raspberries, blueberries, and blackberries as they ripen.',
      sourceUrl: BLACK_BEAR_NATURAL_HISTORY_URL,
    },
  },
  {
    season: 'fall',
    foods: ['beechnuts', 'acorns', 'cherries', 'apples', 'berries'],
    fact: {
      id: 'fall-foods',
      text: 'From late August, bears look for the most nutritious food. When beechnuts and acorns are plentiful, they move into beech and oak stands to eat them.',
      sourceUrl: BLACK_BEAR_NATURAL_HISTORY_URL,
    },
  },
];

export const BEAR_FACTS = {
  insects: {
    id: 'insects',
    text: 'Seeds and insects are major foods for black bears.',
    sourceUrl: BLACK_BEAR_NATURAL_HISTORY_URL,
  },
  denning: {
    id: 'denning',
    text: 'Bears den based on food and snow. With plenty of food they keep eating through November snows; when fall food is scarce, most den by mid-November.',
    sourceUrl: BLACK_BEAR_NATURAL_HISTORY_URL,
  },
  makeNoise: {
    id: 'make-noise',
    text: 'If a bear is in your yard, do not approach it. Make loud noises, like shouting or banging pots and pans, to send it away.',
    sourceUrl: BEAR_ENCOUNTER_URL,
  },
  roads: {
    id: 'roads',
    text: 'Bears that come looking for human food are at greater risk of being hit by cars.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  habituation: {
    id: 'habituation',
    text: 'Campsite food was easy, so she kept coming back. People started seeing her every day, and that is the start of a problem for a bear.',
    sourceUrl: BEAR_FAQ_URL,
  },
} as const satisfies Record<string, BearFact>;

export type CampItemKind = 'trash' | 'feeder' | 'cooler' | 'grill' | 'pet';

/** What putting each Camp Rules item away means, matched to the guidance. */
export const CAMP_ITEM_ACTIONS: Readonly<Record<CampItemKind, BearFact>> = {
  trash: {
    id: 'action-trash',
    text: 'Trash into the shed',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  feeder: {
    id: 'action-feeder',
    text: 'Take the feeder down',
    sourceUrl: BEAR_FAQ_URL,
  },
  cooler: {
    id: 'action-cooler',
    text: 'Food into the bear-proof box',
    sourceUrl: BEAR_FAQ_URL,
  },
  grill: {
    id: 'action-grill',
    text: 'Clean the grill',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  pet: {
    id: 'action-pet',
    text: 'Bowl inside',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
};
