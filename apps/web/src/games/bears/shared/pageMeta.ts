/** Shared by the React pages and the build-time static page shells. */
export type BearsPageMetaEntry = {
  routePath:
    | 'dont-feed-the-bears'
    | 'dont-feed-the-bears/camp'
    | 'dont-feed-the-bears/wild';
  title: string;
  description: string;
  ogImagePath: string;
};

const OG_IMAGE_PATH = '/og-dont-feed-the-bears.jpg';

export const BEARS_PAGE_META = {
  landing: {
    routePath: 'dont-feed-the-bears',
    title: "Don't Feed the Bears - Chris Gagne",
    description:
      'Two quick Vermont games about the same rule, from both sides of the campsite, with real bear tips from Vermont Fish & Wildlife.',
    ogImagePath: OG_IMAGE_PATH,
  },
  camp: {
    routePath: 'dont-feed-the-bears/camp',
    title: "Camp Rules - Don't Feed the Bears - Chris Gagne",
    description:
      'You are the camper. Guests keep leaving food out: put it away and keep camp bear-safe until dark.',
    ogImagePath: OG_IMAGE_PATH,
  },
  wild: {
    routePath: 'dont-feed-the-bears/wild',
    title: "Stay Wild - Don't Feed the Bears - Chris Gagne",
    description:
      'You are the bear. Help Maple fatten up on natural food and reach the den before winter, without getting too comfortable around people.',
    ogImagePath: OG_IMAGE_PATH,
  },
} as const satisfies Record<string, BearsPageMetaEntry>;
