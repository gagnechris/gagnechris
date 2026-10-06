/** Vermont Fish & Wildlife bear-safety tips used by the Don't Feed the Bears games. */

export const BEAR_GUIDANCE_URL =
  'https://vtfishandwildlife.com/learn-more/living-with-wildlife/living-with-black-bears';
export const BEAR_FAQ_URL =
  'https://vtfishandwildlife.com/learn-more/living-with-wildlife/living-with-black-bears/living-with-black-bears-faqs';
export const BEAR_ENCOUNTER_URL =
  'https://vtfishandwildlife.com/learn-more/living-with-wildlife/living-with-black-bears/if-you-encounter-a-bear';
export const BLACK_BEAR_NATURAL_HISTORY_URL =
  'https://vtfishandwildlife.com/learn-more/vermont-critters/mammals/black-bear';

export type BearTipId =
  | 'never-feed'
  | 'fed-bear'
  | 'bird-feeders'
  | 'secure-trash'
  | 'pet-food'
  | 'campsite';

export type BearTip = {
  id: BearTipId;
  title: string;
  body: string;
  sourceUrl: string;
};

/**
 * Careful paraphrases of the linked page. Prefer linking out over inventing
 * legal specifics, fines, or dates the source doesn't give.
 */
export const BEAR_TIPS: readonly BearTip[] = [
  {
    id: 'never-feed',
    title: 'Never feed bears',
    body: 'Do not leave food out for bears or offer them snacks. Feeding a bear on purpose is bad for the bear, and in Vermont it is against the law.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  {
    id: 'fed-bear',
    title: 'A fed bear is a dead bear',
    body: 'Bears that get used to human food keep coming back for more, and that leads to conflicts with people. Vermont Fish & Wildlife says bears used to human food are usually euthanized.',
    sourceUrl: BEAR_FAQ_URL,
  },
  {
    id: 'bird-feeders',
    title: 'Bird feeders: winter only',
    body: 'Put feeders out on December 1, or once snowy winter weather has settled in, and take them down by April 1 at the latest. Bird seed is high in fat and very hard for a hungry bear to resist.',
    sourceUrl: BEAR_FAQ_URL,
  },
  {
    id: 'secure-trash',
    title: 'Store trash securely',
    body: 'Ordinary trash cans alone are not enough. Keep garbage in a secure building or a bear-resistant container until collection day.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  {
    id: 'pet-food',
    title: 'Feed pets indoors',
    body: 'Feed your dogs and cats inside. A bowl of pet food left outdoors is an easy meal that draws bears in.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  {
    id: 'campsite',
    title: 'Keep a clean campsite',
    body: 'Cook meals away from your tent, never eat in it, and do not leave food out. Keep food in a bear-proof container or hang it in a tree.',
    sourceUrl: BEAR_FAQ_URL,
  },
] as const;

const TIP_BY_ID = Object.fromEntries(
  BEAR_TIPS.map((tip) => [tip.id, tip]),
) as Readonly<Record<BearTipId, BearTip>>;

export function tipById(id: BearTipId): BearTip {
  return TIP_BY_ID[id];
}

export function tipAtIndex(index: number): BearTip {
  const i = ((index % BEAR_TIPS.length) + BEAR_TIPS.length) % BEAR_TIPS.length;
  return BEAR_TIPS[i]!;
}
