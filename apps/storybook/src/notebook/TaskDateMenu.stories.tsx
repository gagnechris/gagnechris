import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { taskDateMenuItems } from '@gagnechris/shared';
import { TaskDateMenu } from '@web/kit/tasks/TaskDateMenu';
import { catalog } from '../catalog';

const BASE_DAY = '2026-10-15';

const meta = {
  title: 'Notebook/TaskDateMenu',
  component: TaskDateMenu,
  parameters: catalog(
    'native date picker in `apps/mobile/src/notebook/`',
    'The `@` and `due:` date menu. It is controlled: the field that owns the caret (`TaskSyntaxInput`, `TaskDateButton`, the note editor) handles the keys.',
  ),
  decorators: [
    (Story) => (
      <div style={{ minHeight: '28rem' }}>
        <div className="task-syntax">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    baseId: 'story-menu',
    open: true,
    kind: 'start',
    items: taskDateMenuItems(BASE_DAY, '', 'start'),
    activeIndex: 0,
    onChoose: fn(),
    onActivate: fn(),
    picker: null,
    hint: 'Shows up on Today from that date.',
  },
} satisfies Meta<typeof TaskDateMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShowOn: Story = {};

export const Filtered: Story = {
  args: { items: taskDateMenuItems(BASE_DAY, 'mo', 'start') },
};

export const Deadline: Story = {
  args: { kind: 'due', items: taskDateMenuItems(BASE_DAY, '', 'due') },
};

export const PickADate: Story = {
  args: {
    picker: {
      value: '2026-10-16',
      onChange: fn(),
      onSet: fn(),
      onCancel: fn(),
    },
  },
};

export const Docked: Story = {
  parameters: { layout: 'fullscreen' },
  args: { docked: true },
};
