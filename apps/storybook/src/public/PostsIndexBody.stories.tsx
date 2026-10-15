import type { Meta, StoryObj } from '@storybook/react-vite';
import { PostsIndexBody } from '@gagnechris/public-ui';
import { postsIndexView } from '@gagnechris/shared';
import '@web/public.css';
import '@web/pages/PostsIndex.css';
import { catalog } from '../catalog';
import { withSiteChrome } from './siteChrome';
import { POSTS } from './samples';

const meta = {
  title: 'Public site/PostsIndexBody',
  component: PostsIndexBody,
  parameters: {
    layout: 'fullscreen',
    ...catalog(
      '`apps/mobile/app/site/posts/index.tsx` (`PostPreview` rows from `apps/mobile/src/site/ui.tsx`, `LoadError`)',
      'The Posts page: every published post grouped by year, newest first, with an RSS link. `message` replaces the list while loading or after an error.',
    ),
  },
  decorators: [withSiteChrome('/posts')],
  args: { years: postsIndexView(POSTS) },
} satisfies Meta<typeof PostsIndexBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OneYear: Story = {
  args: { years: postsIndexView(POSTS.slice(0, 2)) },
};

export const UndatedPost: Story = {
  args: {
    years: postsIndexView([
      ...POSTS.slice(0, 2),
      {
        id: '01K7B0000000000000000000P6',
        slug: 'an-undated-note',
        title: 'An undated note',
        excerpt: 'Published without a date, so it sits under its own heading.',
        publishedAt: null,
      },
    ]),
  },
};

export const Empty: Story = { args: { years: [] } };

export const Loading: Story = {
  args: { years: [], message: 'Loading posts…' },
};

export const LoadFailed: Story = {
  args: {
    years: [],
    message: 'Posts couldn’t load. Check your connection and try again.',
  },
};
