import type { Meta, StoryObj } from '@storybook/react-vite';
import { HomeBody, HomeRecentPosts } from '@gagnechris/public-ui';
import { DEFAULT_HOME, renderHomeAboutHtml } from '@gagnechris/shared/render';
import '@web/public.css';
import '@web/App.css';
import '@web/home/homeSections.css';
import '@web/projects/ProjectCard.css';
import '@web/projects/ProjectStage.css';
import '@web/projects/ProjectPreview.css';
import { catalog } from '../catalog';
import { withSiteChrome } from './siteChrome';
import { HOME_PROJECT_CARDS, HOME_RECENT_POSTS } from './samples';

const meta = {
  title: 'Public site/HomeBody',
  component: HomeBody,
  parameters: {
    layout: 'fullscreen',
    ...catalog(
      '`apps/mobile/app/site/home/index.tsx` (recent posts as `PostPreview` from `apps/mobile/src/site/ui.tsx`)',
      'The Home page: name, title, About and the links sentence, then recent posts and the projects that exist. Empty sections are left out.',
    ),
  },
  decorators: [withSiteChrome(null)],
  args: {
    name: DEFAULT_HOME.name,
    title: DEFAULT_HOME.title,
    aboutHtml: renderHomeAboutHtml(DEFAULT_HOME.about),
    recentPosts: HOME_RECENT_POSTS,
    projects: HOME_PROJECT_CARDS,
  },
} satisfies Meta<typeof HomeBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PostsOnly: Story = { args: { projects: [] } };

export const NothingPublished: Story = {
  args: { recentPosts: [], projects: [] },
};

export const LongAbout: Story = {
  args: {
    aboutHtml: renderHomeAboutHtml(
      `${DEFAULT_HOME.about}\n\nOutside work I build small tools for myself, like the Notebook I write these posts in, and spend as much time as I can in Vermont.`,
    ),
  },
};

export const RecentPostsSection: Story = {
  render: ({ recentPosts }) => <HomeRecentPosts posts={recentPosts} />,
};
