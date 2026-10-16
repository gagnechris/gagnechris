import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/Checkbox',
  component: Checkbox,
  parameters: catalog(
    '`apps/mobile/src/ui/Checkbox.tsx` (`square` with `indeterminate`, `round` with `dropped`)',
    'A native checkbox under a drawn box; the whole label is the hit area. `square` for settings and fields (with a mixed state), `round` for tasks (done and dropped strike the label through).',
  ),
  args: { label: 'Featured on the homepage' },
  argTypes: {
    shape: { control: 'inline-radio', options: ['square', 'round'] },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Square: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };

export const Mixed: Story = {
  args: { label: 'Select all', indeterminate: true },
};

export const Disabled: Story = { args: { disabled: true } };

export const RoundTask: Story = {
  args: { shape: 'round', label: 'Pay rent' },
};

export const RoundDone: Story = {
  args: { shape: 'round', label: 'Pay rent', defaultChecked: true },
};

export const RoundDropped: Story = {
  args: { shape: 'round', label: 'Renew passport', dropped: true },
};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <Checkbox label="Unchecked" />
      <Checkbox label="Checked" defaultChecked />
      <Checkbox label="Mixed" indeterminate />
      <Checkbox label="Disabled" disabled />
      <Checkbox label="Disabled checked" disabled defaultChecked />
      <Checkbox shape="round" label="Open task" />
      <Checkbox shape="round" label="Done task" defaultChecked />
      <Checkbox shape="round" label="Dropped task" dropped />
      <Checkbox shape="round" label="Hidden label (task row)" hideLabel />
    </div>
  ),
};
