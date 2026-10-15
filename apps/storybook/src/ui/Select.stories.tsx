import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field, Select } from '@gagnechris/ui';
import { catalog } from '../catalog';

const options = (
  <>
    <option value="work">Work</option>
    <option value="home">Home</option>
    <option value="side">Side projects</option>
  </>
);

const meta = {
  title: 'Shared UI/Select',
  component: Select,
  parameters: catalog(
    'none',
    'The native select with a chevron; only the box is styled.',
  ),
  args: { 'aria-label': 'Area', defaultValue: 'work', children: options },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    children: { control: false },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = { args: { disabled: true } };

export const Invalid: Story = { args: { invalid: true } };

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '16rem' }}>
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <Field key={size} label={`Area (${size})`}>
          <Select size={size} defaultValue="work">
            {options}
          </Select>
        </Field>
      ))}
      <Field label="Area" error="Choose an area">
        <Select defaultValue="">
          <option value="">None</option>
          {options}
        </Select>
      </Field>
    </div>
  ),
};
