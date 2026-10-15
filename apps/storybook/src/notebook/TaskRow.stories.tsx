import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TaskRow } from '@web/kit/tasks/TaskRow';
import { TaskRowActions } from '@web/kit/tasks/TaskRowActions';
import { TaskDuePill } from '@web/kit/tasks/TaskDuePill';
import { TaskParentsContext } from '@web/kit/tasks/taskParents';
import { catalog } from '../catalog';

const parents = new Map([
  ['parent-1', { title: 'Launch the redesign', status: 'todo' as const }],
]);

const meta = {
  title: 'Notebook/TaskRow',
  component: TaskRow,
  parameters: catalog(
    '`apps/mobile/src/ui/TaskRow.tsx`, `apps/mobile/src/ui/SwipeRow.tsx`',
    'A task in a list: checkbox, title linking to the task, priority badge and a meta line. `list` strikes through closed tasks; `today` is the compact panel row.',
  ),
  decorators: [
    (Story) => (
      <TaskParentsContext.Provider value={parents}>
        <ul className="kit-list">
          <Story />
        </ul>
      </TaskParentsContext.Provider>
    ),
  ],
  args: {
    task: { title: 'Write weekly notes', priority: 'med', status: 'todo' },
    onToggle: fn(),
    meta: 'Work · shows 2026-10-15',
    to: '/tasks/01JAAAAAAAAAAAAAAAAAAAAAAA',
    variant: 'list',
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['list', 'today'] },
  },
} satisfies Meta<typeof TaskRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const HighPriority: Story = {
  args: {
    task: { title: 'Renew passport', priority: 'high', status: 'todo' },
  },
};

export const InProgress: Story = {
  args: {
    task: {
      title: 'Draft the Q4 plan',
      priority: 'med',
      status: 'in_progress',
    },
  },
};

export const Done: Story = {
  args: {
    task: { title: 'Write weekly notes', priority: 'med', status: 'done' },
  },
};

export const Dropped: Story = {
  args: {
    task: {
      title: 'Try the new CI runner',
      priority: 'low',
      status: 'dropped',
    },
    meta: 'Work · no date',
  },
};

export const WithDueDate: Story = {
  args: {
    meta: (
      <>
        Work · shows 2026-10-15{' '}
        <TaskDuePill
          due={{ text: 'due Fri', title: 'Due Fri, Oct 16', overdue: false }}
        />
      </>
    ),
  },
};

export const Overdue: Story = {
  args: {
    task: { title: 'File expense report', priority: 'high', status: 'todo' },
    meta: (
      <>
        Admin · shows 2026-10-12{' '}
        <TaskDuePill
          due={{
            text: 'Overdue · Mon',
            title: 'Overdue, was due Mon, Oct 12',
            overdue: true,
          }}
        />
      </>
    ),
  },
};

export const Snoozed: Story = {
  args: {
    task: { title: 'Call the plumber', priority: 'med', status: 'todo' },
    meta: 'Home · shows 2026-10-19',
  },
};

export const Someday: Story = {
  args: {
    task: { title: 'Learn the cello', priority: 'low', status: 'todo' },
    meta: 'Personal · someday',
  },
};

export const WithActions: Story = {
  args: {
    actions: (
      <TaskRowActions
        title="Write weekly notes"
        snoozeFrom="2026-10-15"
        onSnooze={fn()}
        onDrop={fn()}
      />
    ),
  },
};

export const Subtask: Story = {
  args: {
    task: {
      title: 'Pick the brand fonts',
      priority: 'med',
      status: 'todo',
      parentId: 'parent-1',
    },
  },
};

export const LongTitle: Story = {
  args: {
    task: {
      title:
        'Go through every open pull request on the site repository, close the stale ones and write down what is left for next sprint',
      priority: 'med',
      status: 'todo',
    },
  },
};

export const WithoutLink: Story = { args: { to: undefined } };

export const TodayVariant: Story = {
  args: { variant: 'today', meta: 'Thu note · 1 day' },
};
