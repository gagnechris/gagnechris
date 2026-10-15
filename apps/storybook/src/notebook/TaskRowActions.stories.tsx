import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TaskRowActions } from '@web/kit/tasks/TaskRowActions';
import { catalog } from '../catalog';

const meta = {
  title: 'Notebook/TaskRowActions',
  component: TaskRowActions,
  parameters: catalog(
    '`apps/mobile/src/ui/SwipeRow.tsx`',
    'Snooze to Monday, Snooze to another day and Drop, the icon buttons at the end of a task row.',
  ),
  decorators: [
    (Story) => (
      <span className="task-row__actions">
        <Story />
      </span>
    ),
  ],
  args: {
    title: 'Write weekly notes',
    snoozeFrom: '2026-10-15',
    onSnooze: fn(),
    onDrop: fn(),
  },
} satisfies Meta<typeof TaskRowActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutDrop: Story = { args: { onDrop: undefined } };
