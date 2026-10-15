import type { Meta, StoryObj } from '@storybook/react-vite';
import { TaskSyntaxCheatSheet } from '@web/kit/tasks/TaskSyntaxCheatSheet';
import { catalog } from '../catalog';

const meta = {
  title: 'Notebook/TaskSyntaxCheatSheet',
  component: TaskSyntaxCheatSheet,
  parameters: catalog(
    'none',
    'The reference card for the task syntax: `[ ]`, `@` dates, `due:` and `!` priority.',
  ),
} satisfies Meta<typeof TaskSyntaxCheatSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
