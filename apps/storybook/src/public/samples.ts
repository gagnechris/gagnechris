import {
  projectCardViews,
  selectHomeProjects,
  type Project,
  type ProjectCardView,
} from '@gagnechris/shared';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import type {
  HomeRecentPost,
  PostArticleFields,
} from '@gagnechris/shared/render';

export const YEAR = 2026;

// Storybook serves only /fonts, so pictures are inline SVG.
export const placeholderImage = (label: string, width = 1200, height = 750) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="100%" height="100%" fill="#e8e4dc"/>` +
      `<path d="M0 ${height * 0.72} L${width * 0.3} ${height * 0.45} L${width * 0.55} ${height * 0.65} L${width * 0.75} ${height * 0.4} L${width} ${height * 0.6} V${height} H0Z" fill="#c9c1b2"/>` +
      `<text x="50%" y="30%" font-family="Georgia, serif" font-size="${Math.round(height / 12)}" fill="#6b6457" text-anchor="middle">${label}</text>` +
      `</svg>`,
  )}`;

export const BEARS_PREVIEW = placeholderImage('Don’t Feed the Bears');

export const SAMPLE_PROJECT_LIST: readonly Project[] = SAMPLE_PROJECTS.map(
  (p) => (p.previewImage ? { ...p, previewImage: BEARS_PREVIEW } : p),
);

export const PROJECT_CARDS: readonly ProjectCardView[] =
  projectCardViews(SAMPLE_PROJECT_LIST);

export const HOME_PROJECT_CARDS: readonly ProjectCardView[] =
  selectHomeProjects(SAMPLE_PROJECT_LIST);

export const cardFor = (slug: string): ProjectCardView => {
  const card = PROJECT_CARDS.find((c) => c.slug === slug);
  if (!card) throw new Error(`No sample project ${slug}`);
  return card;
};

export const projectFor = (slug: string): Project => {
  const project = SAMPLE_PROJECT_LIST.find((p) => p.slug === slug);
  if (!project) throw new Error(`No sample project ${slug}`);
  return project;
};

export const POSTS: readonly HomeRecentPost[] = [
  {
    id: '01K7A0000000000000000000P5',
    slug: 'tasks-that-carry-forward',
    title: 'Tasks that carry forward',
    excerpt:
      'Why unfinished tasks in Notebook roll into tomorrow’s note instead of piling up in a separate list.',
    publishedAt: '2026-09-18T14:00:00.000Z',
  },
  {
    id: '01K5A0000000000000000000P4',
    slug: 'prerendering-without-a-framework',
    title: 'Prerendering without a framework',
    excerpt:
      'How a DynamoDB stream, one Lambda and react-dom/server keep every public page fast and indexable.',
    publishedAt: '2026-06-02T13:30:00.000Z',
  },
  {
    id: '01K3A0000000000000000000P3',
    slug: 'writing-in-the-open',
    title: 'Writing in the open',
    excerpt:
      'A short note on why this site exists and what I plan to write about.',
    publishedAt: '2026-02-11T16:00:00.000Z',
  },
  {
    id: '01JFA0000000000000000000P2',
    slug: 'what-a-good-one-on-one-looks-like',
    title: 'What a good one-on-one looks like',
    excerpt:
      'The agenda belongs to the report, the notes belong to both of you, and status updates belong somewhere else.',
    publishedAt: '2025-11-20T15:00:00.000Z',
  },
  {
    id: '01JAA0000000000000000000P1',
    slug: 'hiring-for-slope',
    title: 'Hiring for slope',
    excerpt: '',
    publishedAt: '2025-03-04T15:00:00.000Z',
  },
];

export const HOME_RECENT_POSTS = POSTS.slice(0, 3);

export const BUILD_LOG = POSTS.slice(0, 2);

export const SAMPLE_POST: PostArticleFields = {
  slug: 'prerendering-without-a-framework',
  title: 'Prerendering without a framework',
  excerpt:
    'How a DynamoDB stream, one Lambda and react-dom/server keep every public page fast and indexable.',
  publishedAt: '2026-06-02T13:30:00.000Z',
  bodyMarkdown: `Every page on this site is plain HTML by the time it reaches you. There is no server rendering on request and no static-site generator in the build. Instead, publishing a post **writes the page**.

## How it works

When a post is published, the row changes in DynamoDB and the table’s stream invokes a publisher Lambda. The publisher renders the same React components the browser hydrates, and uploads the result to S3:

1. Read the post and the projects it belongs to.
2. Render the page body with \`renderToString\`.
3. Write the HTML, the RSS feed and the sitemap.

\`\`\`ts
const html = renderToString(<PostPageBody post={postArticleView(post)} />);
await s3.send(new PutObjectCommand({ Bucket, Key: \`posts/\${post.slug}\`, Body: html }));
\`\`\`

> The browser and the publisher render the same components, so a page never changes shape when the app takes over.

## What it costs

Publishing takes a couple of seconds longer than saving a draft. Reading costs nothing beyond CloudFront, and the page works with JavaScript turned off.

---

If you want the details, the [source is on GitHub](https://github.com/gagnechris).
`,
};
