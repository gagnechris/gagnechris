import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/StatusBadge',
  component: StatusBadge,
  parameters: catalog(
    'none',
    'The publish state of a post, project or page in Admin.',
  ),
  args: { status: 'draft' },
  argTypes: {
    status: {
      control: 'inline-radio',
      options: ['draft', 'published', 'deleted'],
    },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = {};

export const Published: Story = { args: { status: 'published' } };

export const PublishedWithChanges: Story = {
  args: { status: 'published', hasUnpublishedChanges: true },
};

export const Deleted: Story = { args: { status: 'deleted' } };
