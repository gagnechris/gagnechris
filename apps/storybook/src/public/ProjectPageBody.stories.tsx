import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ProjectDemoPreview,
  ProjectDemoSection,
  ProjectPageBody,
} from '@gagnechris/public-ui';
import type { Project } from '@gagnechris/shared';
import { projectPageView } from '@gagnechris/shared/render';
import '@web/public.css';
import '@web/pages/PostPage.css';
import '@web/pages/ProjectPage.css';
import '@web/projects/ProjectStage.css';
import '@web/projects/ProjectPreview.css';
import { catalog } from '../catalog';
import { BUILD_LOG, projectFor } from './samples';
import { withSiteChrome } from './siteChrome';

const BODY = `## Why I built it

I wanted one place for daily notes and the tasks that come out of them. Separate task apps kept turning into a second inbox.

## How it works

- Each day gets a note from a template.
- Tasks live inside notes, written as \`- [ ]\` lines.
- Anything unfinished carries forward to tomorrow’s note.

## How it’s built

1. A React app, installable on a phone.
2. A Go API on Lambda in front of one DynamoDB table.
3. TanStack Query for offline-friendly reads and autosave.`;

const notebook: Project = {
  ...projectFor('notebook'),
  stageNote: 'since 2026',
  bodyMarkdown: BODY,
  links: [
    { label: 'Source on GitHub', url: 'https://github.com/gagnechris' },
    { label: 'Open Notebook', url: 'https://notebook.gagnechris.com' },
  ],
};

const meta = {
  title: 'Public site/ProjectPageBody',
  component: ProjectPageBody,
  parameters: {
    layout: 'fullscreen',
    ...catalog(
      'none: iOS has no project pages',
      'A project page: stage, name and pitch, the Try it slot when the project has a demo, the body, stack, links and the Build log of posts that belong to it. Without `demoSlot` the slot shows the static preview the publisher prints.',
    ),
  },
  decorators: [withSiteChrome('/projects')],
  args: { project: projectPageView(notebook, BUILD_LOG) },
} satisfies Meta<typeof ProjectPageBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDemoPreview: Story = {};

export const LiveWithImage: Story = {
  args: {
    project: projectPageView(
      { ...projectFor('dont-feed-the-bears'), bodyMarkdown: BODY },
      BUILD_LOG.slice(0, 1),
    ),
  },
};

export const NoDemo: Story = {
  args: { project: projectPageView({ ...notebook, demo: null }, BUILD_LOG) },
};

export const EmptyBuildLog: Story = {
  args: { project: projectPageView({ ...notebook, links: [], stack: [] }) },
};

export const Idea: Story = {
  args: {
    project: projectPageView({
      ...projectFor('next-project'),
      bodyMarkdown: 'A rough idea, written down before any code.',
    }),
  },
};

export const DemoSection: Story = {
  parameters: { layout: 'padded', siteChrome: false },
  render: ({ project }) => (
    <div className="project-page">
      <ProjectDemoSection>
        <ProjectDemoPreview project={project} />
      </ProjectDemoSection>
    </div>
  ),
};
