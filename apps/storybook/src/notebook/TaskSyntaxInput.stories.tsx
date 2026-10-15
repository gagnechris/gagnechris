import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TaskSyntaxInput } from '@web/kit/tasks/TaskSyntaxInput';
import { catalog } from '../catalog';

const meta = {
  title: 'Notebook/TaskSyntaxInput',
  component: TaskSyntaxInput,
  parameters: catalog(
    'none',
    'A text input that offers task date tokens when `@` or `due:` is typed. Type `@` or `due:` to open the menu.',
  ),
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '28rem', minHeight: '26rem' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    value: '',
    onChange: fn(),
    today: '2026-10-15',
    'aria-label': 'New task',
    placeholder: 'Add a task: @tomorrow, due:fri, !high',
  },
} satisfies Meta<typeof TaskSyntaxInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const Controlled = ({
  initial,
  today,
  onChange,
}: {
  initial: string;
  today: string;
  onChange: (value: string) => void;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <TaskSyntaxInput
      aria-label="New task"
      placeholder="Add a task: @tomorrow, due:fri, !high"
      today={today}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
};

export const Empty: Story = {
  render: (args) => (
    <Controlled initial="" today={args.today} onChange={args.onChange} />
  ),
};

export const WithTokens: Story = {
  render: (args) => (
    <Controlled
      initial="Renew passport @mon due:oct 30 !high"
      today={args.today}
      onChange={args.onChange}
    />
  ),
};

export const Disabled: Story = {
  args: { value: 'Renew passport @mon', disabled: true },
};
