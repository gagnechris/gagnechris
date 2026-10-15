import type { Meta, StoryObj } from '@storybook/react-vite';
import { SaveIndicator } from '@web/workspace/ui/SaveIndicator';
import { catalog } from '../catalog';

const meta = {
  title: 'Workspace/SaveIndicator',
  component: SaveIndicator,
  parameters: catalog(
    'none',
    'The autosave state next to an editor. It also says when the browser is offline.',
  ),
  args: { saveState: 'idle', dirty: false },
  argTypes: {
    saveState: {
      control: 'inline-radio',
      options: ['idle', 'saving', 'saved', 'error'],
    },
  },
} satisfies Meta<typeof SaveIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Unsaved: Story = { args: { dirty: true } };

export const Saving: Story = { args: { saveState: 'saving', dirty: true } };

export const Saved: Story = { args: { saveState: 'saved' } };

export const Error: Story = { args: { saveState: 'error', dirty: true } };

export const NewEntity: Story = { args: { isNew: true, dirty: true } };

export const Quiet: Story = {
  args: { saveState: 'saved', quiet: true },
  parameters: {
    docs: {
      description: {
        story: 'Routine states are read to screen readers but not shown.',
      },
    },
  },
};
