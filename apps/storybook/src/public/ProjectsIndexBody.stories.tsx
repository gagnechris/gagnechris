import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectsIndexBody } from '@gagnechris/public-ui';
import '@web/public.css';
import '@web/pages/ProjectsIndex.css';
import '@web/projects/ProjectCard.css';
import '@web/projects/ProjectStage.css';
import '@web/projects/ProjectPreview.css';
import { catalog } from '../catalog';
import { PROJECT_CARDS } from './samples';
import { withSiteChrome } from './siteChrome';

const meta = {
  title: 'Public site/ProjectsIndexBody',
  component: ProjectsIndexBody,
  parameters: {
    layout: 'fullscreen',
    ...catalog(
      'none: iOS has no Projects tab',
      'The Projects page: every published project as a card, in display order. `message` replaces the list while loading or after an error.',
    ),
  },
  decorators: [withSiteChrome('/projects')],
  args: { projects: PROJECT_CARDS },
} satisfies Meta<typeof ProjectsIndexBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OneProject: Story = {
  args: { projects: PROJECT_CARDS.slice(0, 1) },
};

export const Empty: Story = { args: { projects: [] } };

export const Loading: Story = {
  args: { projects: [], message: 'Loading projects…' },
};

export const LoadFailed: Story = {
  args: {
    projects: [],
    message: 'Projects couldn’t load. Check your connection and try again.',
  },
};
