import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TaskDateButton } from '@web/kit/tasks/TaskDateButton';
import { catalog } from '../catalog';

const meta = {
  title: 'Notebook/TaskDateButton',
  component: TaskDateButton,
  parameters: catalog(
    'native date picker in `apps/mobile/src/notebook/`',
    'A button that opens the task date menu (a select-only combobox: the button keeps focus and owns the arrow keys). Click it to open the menu.',
  ),
  decorators: [
    (Story) => (
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          minHeight: '26rem',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    kind: 'start',
    baseDay: '2026-10-15',
    onChoose: fn(),
    hint: 'Shows up on Today from that date.',
    className: 'kit-btn',
    ariaLabel: 'Show this task on another day',
    children: 'Show on…',
  },
} satisfies Meta<typeof TaskDateButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShowOn: Story = {};

export const DeadlineWithClear: Story = {
  args: {
    kind: 'due',
    clearLabel: 'No deadline',
    ariaLabel: 'Set a deadline',
    children: 'Deadline…',
  },
};

export const OpensUpward: Story = {
  decorators: [
    (Story) => (
      <div style={{ paddingTop: '24rem' }}>
        <Story />
      </div>
    ),
  ],
  args: { up: true },
};

export const Disabled: Story = { args: { disabled: true } };
