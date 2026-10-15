import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TaskEmbedRow, type TaskEmbedView } from '@web/kit/tasks/TaskEmbedRow';
import '@web/kit/markdown/markdown.css';
import { catalog } from '../catalog';

const ID = '01JAAAAAAAAAAAAAAAAAAAAAAA';

const taskView = (
  overrides: Partial<Extract<TaskEmbedView, { kind: 'task' }>> = {},
): TaskEmbedView => ({
  kind: 'task',
  task: { title: 'Write spec', status: 'todo', priority: 'high' },
  schedule: '@Tue',
  onToggle: fn(),
  to: `/tasks/${ID}`,
  ...overrides,
});

const meta = {
  title: 'Notebook/TaskEmbedRow',
  component: TaskEmbedRow,
  parameters: catalog(
    '`apps/mobile/src/ui/TaskEmbedRow.tsx`',
    'A task embedded in a note (`{{task:…}}`): checkbox, editable title, schedule, deadline and priority pills, and the open link. Also the loading, deleted and failed placeholders.',
  ),
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '36rem' }}>
        <Story />
      </div>
    ),
  ],
  args: { view: taskView() },
} satisfies Meta<typeof TaskEmbedRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Editable: Story = {
  args: { view: taskView({ onRename: fn() }) },
};

export const Done: Story = {
  args: {
    view: taskView({
      task: { title: 'Write spec', status: 'done', priority: 'high' },
    }),
  },
};

export const Dropped: Story = {
  args: {
    view: taskView({
      task: {
        title: 'Try the new CI runner',
        status: 'dropped',
        priority: 'med',
      },
      schedule: undefined,
    }),
  },
};

export const MediumPriorityUnscheduled: Story = {
  args: {
    view: taskView({
      task: { title: 'Read the RFC', status: 'todo', priority: 'med' },
      schedule: undefined,
    }),
  },
};

export const WithDueDate: Story = {
  args: {
    view: taskView({
      due: { text: 'due Fri', title: 'Due Fri, Oct 16', overdue: false },
    }),
  },
};

export const Overdue: Story = {
  args: {
    view: taskView({
      task: { title: 'File expense report', status: 'todo', priority: 'low' },
      schedule: undefined,
      due: {
        text: 'Overdue · Mon',
        title: 'Overdue, was due Mon, Oct 12',
        overdue: true,
      },
    }),
  },
};

export const Pending: Story = {
  args: { view: taskView({ pending: true, onRename: fn(), to: undefined }) },
};

export const LongTitle: Story = {
  args: {
    view: taskView({
      task: {
        title:
          'Go through every open pull request on the site repository, close the stale ones and write down what is left for next sprint',
        status: 'todo',
        priority: 'med',
      },
      onRename: fn(),
    }),
  },
};

export const Loading: Story = { args: { view: { kind: 'loading' } } };

export const Deleted: Story = { args: { view: { kind: 'deleted' } } };

export const Failed: Story = {
  args: { view: { kind: 'failed', title: 'Write spec', onRetry: fn() } },
};

export const Movable: Story = {
  args: {
    view: taskView({ onRename: fn() }),
    moving: { shift: fn(), indent: fn(() => true), drag: fn() },
  },
};

export const WithSubtasks: Story = {
  args: {
    view: taskView({
      task: { title: 'Launch the redesign', status: 'todo', priority: 'med' },
    }),
    subtasks: { done: 2, total: 5, folded: false, onToggleFold: fn() },
  },
};

export const AllSubtasksDone: Story = {
  args: {
    view: taskView({
      task: { title: 'Launch the redesign', status: 'todo', priority: 'med' },
    }),
    subtasks: { done: 5, total: 5, folded: true, onToggleFold: fn() },
  },
};

export const FinishPrompt: Story = {
  args: {
    view: taskView({
      task: { title: 'Launch the redesign', status: 'done', priority: 'med' },
    }),
    subtasks: { done: 3, total: 5, folded: false, onToggleFold: fn() },
    finish: {
      open: 2,
      onCompleteAll: fn(),
      onJustParent: fn(),
      onUndo: fn(),
    },
  },
};

export const SubtaskWithParentLabel: Story = {
  args: {
    view: taskView({
      task: { title: 'Pick the brand fonts', status: 'todo', priority: 'med' },
      schedule: undefined,
    }),
    parent: { title: 'Launch the redesign', finished: false },
  },
};

const WithDetails = ({ initiallyOpen }: { initiallyOpen: boolean }) => {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <TaskEmbedRow
      view={taskView({ onRename: () => {} })}
      details={{
        open,
        onToggle: () => setOpen((o) => !o),
        hasDescription: true,
        peek: 'Cover the sync protocol and the conflict rules.',
        panel: (
          <p style={{ margin: 0 }}>
            Cover the sync protocol and the conflict rules. Link the earlier
            notes on offline edits.
          </p>
        ),
      }}
    />
  );
};

export const DetailsClosed: Story = {
  render: () => <WithDetails initiallyOpen={false} />,
};

export const DetailsOpen: Story = {
  render: () => <WithDetails initiallyOpen />,
};
