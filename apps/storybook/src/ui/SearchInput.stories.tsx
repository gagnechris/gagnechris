import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SearchInput } from '@gagnechris/ui';
import { catalog } from '../catalog';

const meta = {
  title: 'Shared UI/SearchInput',
  component: SearchInput,
  parameters: catalog(
    '`apps/mobile/src/ui/SearchInput.tsx`',
    'A search icon at the start and a clear button once there is text. Escape clears; on an empty box Escape passes through to close the popup around it. No error state.',
  ),
  args: {
    'aria-label': 'Search notes',
    placeholder: 'Search notes',
    value: '',
    onValueChange: fn(),
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const Live = ({
  initial,
  size,
  disabled,
}: {
  initial: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <SearchInput
      aria-label="Search notes"
      placeholder="Search notes"
      value={value}
      onValueChange={setValue}
      size={size}
      disabled={disabled}
    />
  );
};

export const Empty: Story = { render: () => <Live initial="" /> };

export const WithText: Story = { render: () => <Live initial="taxes" /> };

export const Disabled: Story = {
  render: () => <Live initial="" disabled />,
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '20rem' }}>
      <Live initial="small" size="sm" />
      <Live initial="medium" />
      <Live initial="large" size="lg" />
    </div>
  ),
};
