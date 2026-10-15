import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskParentLabel } from '@web/kit/tasks/TaskParentLabel';
import { TaskParentsContext } from '@web/kit/tasks/taskParents';
import { catalog } from '../catalog';

const parents = new Map([
  ['open', { title: 'Launch the redesign', status: 'todo' as const }],
  ['done', { title: 'Move to the new flat', status: 'done' as const }],
]);

const meta = {
  title: 'Notebook/TaskParentLabel',
  component: TaskParentLabel,
  parameters: catalog(
    '`apps/mobile/src/ui/TaskParentLabel.tsx`',
    'A subtask’s parent title, small above its own; muted once the parent is finished. Parents come from `TaskParentsContext`.',
  ),
  decorators: [
    (Story) => (
      <TaskParentsContext.Provider value={parents}>
        <span className="kit-list__title">
          <Story />
          Pick the brand fonts
        </span>
      </TaskParentsContext.Provider>
    ),
  ],
  args: { parentId: 'open' },
} satisfies Meta<typeof TaskParentLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OpenParent: Story = {};

export const FinishedParent: Story = { args: { parentId: 'done' } };

export const NoParent: Story = { args: { parentId: null } };
