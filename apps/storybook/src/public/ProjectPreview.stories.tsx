import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProjectPreview } from '@gagnechris/public-ui';
import '@web/public.css';
import '@web/projects/ProjectPreview.css';
import { catalog } from '../catalog';
import { BEARS_PREVIEW } from './samples';

const meta = {
  title: 'Public site/ProjectPreview',
  component: ProjectPreview,
  parameters: catalog(
    'none',
    'The picture at the top of a project card and in a project page’s Try it slot: the uploaded image, a mini UI drawn for the demo, or a placeholder for an idea.',
  ),
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 420 }}>
        <Story />
      </div>
    ),
  ],
  args: { card: { previewImage: null, stage: 'live', demo: 'posts' } },
} satisfies Meta<typeof ProjectPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PostsMini: Story = {};

export const NotebookMini: Story = {
  args: { card: { previewImage: null, stage: 'building', demo: 'notebook' } },
};

export const GenericMini: Story = {
  args: { card: { previewImage: null, stage: 'building', demo: null } },
};

export const Idea: Story = {
  args: { card: { previewImage: null, stage: 'idea', demo: null } },
};

export const Image: Story = {
  args: { card: { previewImage: BEARS_PREVIEW, stage: 'live', demo: null } },
};
