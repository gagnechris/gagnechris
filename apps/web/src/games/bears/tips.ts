/** Vermont Fish & Wildlife bear-safety tips used by the Don't Feed the Bears game. */

export const BEAR_GUIDANCE_URL =
  'https://vtfishandwildlife.com/learn-more/living-with-wildlife/living-with-black-bears'

export type BearTip = {
  id: string
  title: string
  body: string
  sourceUrl: string
}

/**
 * Careful paraphrases of Vermont Fish & Wildlife living-with-black-bears guidance.
 * Prefer linking out over inventing legal specifics or exact fines.
 */
export const BEAR_TIPS: readonly BearTip[] = [
  {
    id: 'never-feed',
    title: 'Never feed bears',
    body: 'Do not leave food out for bears or offer them snacks. In Vermont, purposely feeding bears is illegal — and it puts people and bears at risk.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  {
    id: 'fed-bear',
    title: 'A fed bear is a dead bear',
    body: 'Bears that learn to associate people with food become habituated. Habituated bears often end up in conflicts that wildlife officials must resolve — sometimes by euthanizing the bear.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  {
    id: 'bird-feeders',
    title: 'Bird feeders: December–March only',
    body: 'Take bird feeders down outside of winter. Vermont guidance is to offer bird seed only from December through March, when bears are typically denning.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  {
    id: 'secure-trash',
    title: 'Store trash securely',
    body: 'Ordinary trash cans alone are not enough. Keep garbage in a secure building or a certified bear-resistant container until collection day.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  {
    id: 'pet-food',
    title: 'Feed pets indoors',
    body: 'Bring pet food bowls inside. Outdoor pet food is an easy attractant that draws bears into yards and camps.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
  {
    id: 'campsite',
    title: 'Keep a clean campsite',
    body: 'Do not leave food, coolers, or cooking gear accessible at camp. Store attractants in a vehicle or bear-resistant storage when you are away from the site.',
    sourceUrl: BEAR_GUIDANCE_URL,
  },
] as const

export function tipById(id: string): BearTip | undefined {
  return BEAR_TIPS.find((tip) => tip.id === id)
}

export function tipAtIndex(index: number): BearTip {
  const i = ((index % BEAR_TIPS.length) + BEAR_TIPS.length) % BEAR_TIPS.length
  return BEAR_TIPS[i]!
}
