import type { Project } from '../schemas.js';

const project = (over: Partial<Project> & Pick<Project, 'slug'>): Project => ({
  id: `01SAMPLE${over.slug.toUpperCase().replace(/-/g, '')}`,
  name: over.slug,
  pitch: '',
  stage: 'building',
  stageNote: '',
  previewImage: null,
  bodyMarkdown: '## Why I built it\n\nBecause.',
  stack: [],
  links: [],
  demo: null,
  order: 0,
  href: null,
  status: 'published',
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
  ...over,
});

/** One of each stage, a card that links elsewhere and an unlinked idea, out of order. */
export const SAMPLE_PROJECTS: readonly Project[] = [
  project({
    slug: 'next-project',
    name: '[Next project]',
    pitch: '[One-line pitch]',
    stage: 'idea',
    bodyMarkdown: '',
    order: 40,
  }),
  project({
    slug: 'notebook',
    name: 'Notebook',
    pitch:
      'Daily notes and tasks in one place. Tasks live inside notes, and anything unfinished carries forward to tomorrow.',
    stack: ['React', 'TanStack Query', 'DynamoDB', 'installable on phone'],
    demo: 'notebook',
    order: 20,
  }),
  project({
    slug: 'posts',
    name: 'Posts',
    pitch:
      'The publishing system behind this site. Write in the admin, publish, and the page, RSS feed and sitemap update on their own.',
    stage: 'live',
    stageNote: 'since 2026',
    stack: ['React', 'AWS Lambda', 'DynamoDB Streams', 'CloudFront'],
    demo: 'posts',
    order: 10,
  }),
  project({
    slug: 'dont-feed-the-bears',
    name: 'Don’t Feed the Bears',
    pitch:
      'A short Vermont camp mini-game: secure attractants before black bears reach them, then learn real tips from Vermont Fish & Wildlife.',
    stage: 'live',
    stageNote: 'for fun',
    previewImage: '/media/projects/dont-feed-the-bears.jpg',
    stack: ['Plays in the browser', 'no login'],
    href: '/dont-feed-the-bears',
    order: 30,
  }),
];
