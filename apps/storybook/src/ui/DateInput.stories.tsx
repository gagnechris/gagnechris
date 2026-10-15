import type { Meta, StoryObj } from '@storybook/react-vite';
import { DateInput, Field } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/DateInput',
  component: DateInput,
  parameters: catalog(
    'native date picker in `apps/mobile/src/notebook/`',
    'A native date input with a calendar icon at the end.',
  ),
  args: { 'aria-label': 'Due', defaultValue: '2026-10-15' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof DateInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { defaultValue: undefined } };

export const Disabled: Story = { args: { disabled: true } };

export const Invalid: Story = { args: { invalid: true } };

export const InField: Story = {
  render: () => (
    <Field label="Snooze until" hint="The task comes back that morning">
      <DateInput defaultValue="2026-10-20" />
    </Field>
  ),
};
