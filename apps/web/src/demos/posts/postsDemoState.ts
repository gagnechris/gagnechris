import { EMPTY_SLUG_FALLBACK, slugify } from '@gagnechris/shared';
import type { HomeRecentPost } from '@gagnechris/shared/render';

export type PostDraft = { title: string; bodyMarkdown: string };

export type PublishedDemoPost = PostDraft & {
  slug: string;
  publishedAt: string;
};

export type PostsDemoState = {
  draft: PostDraft;
  published: PublishedDemoPost | null;
  /** Bumped on every publish so Home can replay its highlight. */
  publishes: number;
};

export type PostsDemoStatus = 'draft' | 'published' | 'unpublished';

export type PostsDemoAction =
  { type: 'edit'; patch: Partial<PostDraft> } | { type: 'publish'; at: string };

/** posts.css shows one per layout; the panes stack at the same breakpoint. */
export const POSTS_DEMO_NOTE = {
  sideBySide: 'Write on the left, publish, watch the right. Nothing is saved.',
  stacked: 'Write above, publish, watch below. Nothing is saved.',
};

export const POSTS_DEMO_CAPTIONS: Record<PostsDemoStatus, string> = {
  draft:
    'Draft: only the editor sees it. The public side still shows what’s live.',
  published:
    'Published. In the real system this rebuilds the post page, Home, RSS and the sitemap.',
  unpublished:
    'Unpublished changes: the public side keeps the published version until you publish again.',
};

export const POSTS_DEMO_BODY_HINT =
  'Markdown: ## for a heading, **bold**, - for a list, [text](https://…) for a link';

export const DEMO_POST_ID = 'demo-post';

/** Already live before the demo starts. */
export const WELCOME_POST: HomeRecentPost & { updatedAt: string } = {
  id: 'demo-welcome',
  slug: 'welcome',
  title: 'Welcome',
  excerpt: '',
  publishedAt: '2026-02-01T12:00:00.000Z',
  updatedAt: '2026-02-01T12:00:00.000Z',
};

export const seedPostsDemo = (): PostsDemoState => ({
  draft: {
    title: 'Hello from the demo',
    bodyMarkdown: [
      'This post was written on the left a moment ago.',
      '',
      '## What happens next',
      '',
      'Press Publish and it shows up on the public side, at the top of Recent posts.',
      '',
    ].join('\n'),
  },
  published: null,
  publishes: 0,
});

export const demoPostSlug = (title: string): string =>
  slugify(title) || EMPTY_SLUG_FALLBACK;

export const postsDemoStatus = ({
  draft,
  published,
}: PostsDemoState): PostsDemoStatus => {
  if (!published) return 'draft';
  return draft.title === published.title &&
    draft.bodyMarkdown === published.bodyMarkdown
    ? 'published'
    : 'unpublished';
};

export const canPublish = (state: PostsDemoState): boolean =>
  state.draft.title.trim() !== '' && postsDemoStatus(state) !== 'published';

export const postsDemoReducer = (
  state: PostsDemoState,
  action: PostsDemoAction,
): PostsDemoState => {
  if (action.type === 'edit') {
    return { ...state, draft: { ...state.draft, ...action.patch } };
  }
  if (!canPublish(state)) return state;
  return {
    ...state,
    published: {
      ...state.draft,
      slug: demoPostSlug(state.draft.title),
      publishedAt: state.published?.publishedAt ?? action.at,
    },
    publishes: state.publishes + 1,
  };
};
