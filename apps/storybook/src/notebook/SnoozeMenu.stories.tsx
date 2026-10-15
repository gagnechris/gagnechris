import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SnoozeMenu } from '@web/kit/tasks/SnoozeMenu';
import { catalog } from '../catalog';

const meta = {
  title: 'Notebook/SnoozeMenu',
  component: SnoozeMenu,
  parameters: catalog(
    'native date picker in `apps/mobile/src/notebook/`',
    'Snooze to another day: the chevron on a task row, or a text button that opens upward in a bottom bar. Click it to open the menu.',
  ),
  decorators: [
    (Story) => (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          minHeight: '24rem',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Write weekly notes',
    baseDay: '2026-10-15',
    onChoose: fn(),
  },
} satisfies Meta<typeof SnoozeMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconButton: Story = {};

export const TextButton: Story = {
  decorators: [
    (Story) => (
      <div style={{ paddingTop: '22rem' }}>
        <Story />
      </div>
    ),
  ],
  args: { label: 'Snooze' },
};

export const Disabled: Story = { args: { disabled: true } };
