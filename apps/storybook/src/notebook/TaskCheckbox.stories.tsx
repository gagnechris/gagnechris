import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TaskCheckbox } from '@web/kit/tasks/TaskRow';
import { catalog } from '../catalog';

const meta = {
  title: 'Notebook/TaskCheckbox',
  component: TaskCheckbox,
  parameters: catalog(
    '`apps/mobile/src/ui/TaskRow.tsx`',
    'The completion checkbox on task rows; its label says whether it completes or reopens the task.',
  ),
  args: {
    task: { title: 'Write weekly notes', status: 'todo' },
    onToggle: fn(),
  },
} satisfies Meta<typeof TaskCheckbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Done: Story = {
  args: { task: { title: 'Write weekly notes', status: 'done' } },
};

export const Disabled: Story = { args: { disabled: true } };
