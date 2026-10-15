import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectCard } from '@gagnechris/public-ui';
import '@web/public.css';
import '@web/projects/ProjectCard.css';
import '@web/projects/ProjectStage.css';
import '@web/projects/ProjectPreview.css';
import { catalog } from '../catalog';
import { cardFor } from './samples';

const meta = {
  title: 'Public site/ProjectCard',
  component: ProjectCard,
  parameters: catalog(
    '`Card` in `apps/mobile/src/site/ui.tsx` (iOS lists no projects)',
    'One project on the Projects page and Home: preview, stage, name, pitch and stack, linked to its page or `href`. An idea without a page is not a link.',
  ),
  decorators: [
    (Story) => (
      <ul className="project-list" style={{ maxWidth: 420 }}>
        <Story />
      </ul>
    ),
  ],
  args: { card: cardFor('posts'), heading: 'h2' },
  argTypes: { heading: { control: 'inline-radio', options: ['h2', 'h3'] } },
} satisfies Meta<typeof ProjectCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LiveWithDemo: Story = {};

export const Building: Story = { args: { card: cardFor('notebook') } };

export const WithImageLinkingElsewhere: Story = {
  args: { card: cardFor('dont-feed-the-bears') },
};

export const UnlinkedIdea: Story = { args: { card: cardFor('next-project') } };

export const NoPitchOrStack: Story = {
  args: { card: { ...cardFor('notebook'), pitch: '', stack: [] } },
};
