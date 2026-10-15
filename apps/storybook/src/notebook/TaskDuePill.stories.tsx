import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskDuePill } from '@web/kit/tasks/TaskDuePill';
import { catalog } from '../catalog';

const meta = {
  title: 'Notebook/TaskDuePill',
  component: TaskDuePill,
  parameters: catalog(
    'inside `apps/mobile/src/ui/TaskRow.tsx`',
    'A task’s deadline: `due Thu` within the week, `due Oct 30` later, red `Overdue · Mon` once passed. Renders nothing without a deadline.',
  ),
  args: { due: { text: 'due Fri', title: 'Due Fri, Oct 16', overdue: false } },
} satisfies Meta<typeof TaskDuePill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ThisWeek: Story = {};

export const Today: Story = {
  args: {
    due: { text: 'due today', title: 'Due today, Thu, Oct 15', overdue: false },
  },
};

export const Later: Story = {
  args: {
    due: { text: 'due Oct 30', title: 'Due Fri, Oct 30', overdue: false },
  },
};

export const Overdue: Story = {
  args: {
    due: {
      text: 'Overdue · Mon',
      title: 'Overdue, was due Mon, Oct 12',
      overdue: true,
    },
  },
};
